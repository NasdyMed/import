const { mapEvent } = require('./mapper');

function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function rejectionReason(event, references) {
  if (isBlank(event.r_i_formula_code)) return 'missing_formula_code';
  if (isBlank(event.plant_code)) return 'missing_plant_code';
  if (references.frmId == null) return 'unresolved_formula_code';
  if (references.facCode == null) return 'unresolved_plant_code';
  return null;
}

async function safeLog(logger, level, payload) {
  if (typeof logger?.[level] !== 'function') return;

  try {
    await logger[level](payload);
  } catch {
    // Logging is best-effort and must not interrupt the import.
  }
}

function errorDetails(error, page) {
  const code = typeof error?.code === 'string' ? error.code : null;
  const status = Number.isInteger(error?.response?.status) ? error.response.status : null;
  const component = status !== null
    ? 'http'
    : error?.errorNum || /^(ORA|NJS|DPI)-/.test(code ?? '')
      ? 'oracle'
      : 'import';
  const message = String(error?.message ?? 'Unknown import error')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:client_secret|password)\s*[=:]\s*)[^&\s]+/gi, '$1[REDACTED]');

  return { event: 'import_failed', page, component, code, status, message };
}

async function runImport({ sddsClient, resolver, repository, logger, commitEveryPages = 20 }) {
  if (!Number.isInteger(commitEveryPages) || commitEveryPages <= 0) {
    throw new RangeError('commitEveryPages must be a positive integer');
  }

  const devMode = repository.mode === 'dev';
  const summary = devMode
    ? { pages: 0, received: 0, inserted: 0, generated: 0, rejected: 0 }
    : { pages: 0, received: 0, inserted: 0, rejected: 0 };
  let uncommittedPages = 0;
  let currentPage = null;

  try {
    for await (const { pageNumber, data } of sddsClient.pages()) {
      currentPage = pageNumber;
      summary.pages += 1;
      summary.received += data.length;

      const references = await resolver.resolvePage(data);
      const rows = [];

      for (let index = 0; index < data.length; index += 1) {
        const event = data[index];
        let reason = rejectionReason(event, references[index]);
        let mapped;

        if (reason === null) {
          mapped = mapEvent(event, references[index]);
          if (!mapped.ok) reason = mapped.reason;
        }

        if (reason !== null) {
          summary.rejected += 1;
          await safeLog(logger, 'warn', {
            event: 'rejected_item',
            page: pageNumber,
            r_i_formula_code: event.r_i_formula_code,
            plant_code: event.plant_code,
            reason,
          });
        } else {
          rows.push(mapped.row);
        }
      }

      await repository.insertRows(rows);
      if (devMode) summary.generated += rows.length;
      else summary.inserted += rows.length;
      uncommittedPages += 1;
      const pageLog = {
        event: 'page_processed',
        page: pageNumber,
        received: data.length,
        inserted: devMode ? 0 : rows.length,
        rejected: data.length - rows.length,
      };
      if (devMode) pageLog.generated = rows.length;
      await safeLog(logger, 'info', pageLog);

      if (typeof repository.completePage === 'function') {
        await repository.completePage(pageNumber);
      }

      if (!devMode && uncommittedPages === commitEveryPages) {
        await repository.commit();
        await safeLog(logger, 'info', { event: 'transaction_committed', page: pageNumber });
        uncommittedPages = 0;
      }
    }

    if (devMode && typeof repository.finish === 'function') {
      await repository.finish();
    } else if (uncommittedPages > 0) {
      await repository.commit();
      await safeLog(logger, 'info', { event: 'transaction_committed', page: currentPage });
    }

    return summary;
  } catch (error) {
    await safeLog(logger, 'error', errorDetails(error, currentPage));
    try {
      await repository.rollback();
    } catch {
      // Preserve the import failure as the error observed by the caller.
    }
    throw error;
  }
}

module.exports = { runImport };
