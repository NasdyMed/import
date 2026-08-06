function isNonEmpty(value) {
  return value !== null && value !== undefined && value !== '';
}

function missingValues(events, property, cache) {
  return [
    ...new Set(
      events
        .map((event) => event[property])
        .filter((value) => isNonEmpty(value) && !cache.has(value)),
    ),
  ];
}

function rowValues(row, keyColumn, valueColumn) {
  if (Array.isArray(row)) {
    return [row[0], row[1]];
  }

  return [
    row[keyColumn] ?? row[keyColumn.toLowerCase()],
    row[valueColumn] ?? row[valueColumn.toLowerCase()],
  ];
}

async function loadMissing(connection, values, sqlPrefix, keyColumn, valueColumn, cache) {
  if (values.length === 0) {
    return;
  }

  const binds = Object.fromEntries(values.map((value, index) => [`v${index}`, value]));
  const placeholders = values.map((_, index) => `:v${index}`).join(', ');
  const result = await connection.execute(`${sqlPrefix} (${placeholders})`, binds);

  for (const value of values) {
    cache.set(value, null);
  }
  for (const row of result.rows || []) {
    const [key, value] = rowValues(row, keyColumn, valueColumn);
    cache.set(key, value);
  }
}

function createReferenceResolver(connection) {
  const formulaCache = new Map();
  const factoryCache = new Map();

  async function resolvePage(events) {
    const formulaCodes = missingValues(events, 'r_i_formula_code', formulaCache);
    const plantCodes = missingValues(events, 'plant_code', factoryCache);

    await loadMissing(
      connection,
      formulaCodes,
      'SELECT FRM_CD, FRM_ID FROM FL_FORMULA.FL_FORMULA WHERE FRM_CD IN',
      'FRM_CD',
      'FRM_ID',
      formulaCache,
    );
    await loadMissing(
      connection,
      plantCodes,
      'SELECT SAP_FAC_CODE, FAC_CODE FROM fl_formula_import.dgo_factory WHERE SAP_FAC_CODE IN',
      'SAP_FAC_CODE',
      'FAC_CODE',
      factoryCache,
    );

    return events.map((event) => ({
      frmId: isNonEmpty(event.r_i_formula_code)
        ? formulaCache.get(event.r_i_formula_code) ?? null
        : null,
      facCode: isNonEmpty(event.plant_code) ? factoryCache.get(event.plant_code) ?? null : null,
    }));
  }

  return { resolvePage };
}

module.exports = { createReferenceResolver };
