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

async function safeWarn(logger, payload) {
  if (typeof logger?.warn !== 'function') return;

  try {
    await logger.warn(payload);
  } catch {
    // Logging is best-effort and must not interrupt the import.
  }
}

async function runImport({ sddsClient, resolver, repository, logger, commitEveryPages = 20 }) {
  if (!Number.isInteger(commitEveryPages) || commitEveryPages <= 0) {
    throw new RangeError('commitEveryPages must be a positive integer');
  }

  const summary = { pages: 0, received: 0, inserted: 0, rejected: 0 };
  let uncommittedPages = 0;

  try {
    for await (const { pageNumber, data } of sddsClient.pages()) {
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
          await safeWarn(logger, {
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
      summary.inserted += rows.length;
      uncommittedPages += 1;

      if (uncommittedPages === commitEveryPages) {
        await repository.commit();
        uncommittedPages = 0;
      }
    }

    if (uncommittedPages > 0) {
      await repository.commit();
    }

    return summary;
  } catch (error) {
    try {
      await repository.rollback();
    } catch {
      // Preserve the import failure as the error observed by the caller.
    }
    throw error;
  }
}

module.exports = { runImport };
