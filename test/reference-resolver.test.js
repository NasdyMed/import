const assert = require('node:assert/strict');
const test = require('node:test');

const { createReferenceResolver } = require('../src/reference-resolver');

function fakeConnection(responses) {
  const calls = [];
  return {
    calls,
    async execute(sql, binds) {
      calls.push({ sql, binds });
      return { rows: responses.shift() };
    },
  };
}

test('batches deduplicated lookups and aligns references with events', async () => {
  const connection = fakeConnection([
    [
      { FRM_CD: 'F-1', FRM_ID: 101 },
      { FRM_CD: 'F-2', FRM_ID: 202 },
    ],
    [
      { SAP_FAC_CODE: 'P-1', FAC_CODE: 'FAC-A' },
      { SAP_FAC_CODE: 'P-2', FAC_CODE: 'FAC-B' },
    ],
  ]);
  const resolvePage = createReferenceResolver(connection);

  const references = await resolvePage([
    { r_i_formula_code: 'F-1', plant_code: 'P-2' },
    { r_i_formula_code: 'F-2', plant_code: 'P-1' },
    { r_i_formula_code: 'F-1', plant_code: 'P-1' },
    { r_i_formula_code: '', plant_code: null },
  ]);

  assert.deepEqual(references, [
    { frmId: 101, facCode: 'FAC-B' },
    { frmId: 202, facCode: 'FAC-A' },
    { frmId: 101, facCode: 'FAC-A' },
    { frmId: null, facCode: null },
  ]);
  assert.deepEqual(connection.calls, [
    {
      sql: 'SELECT FRM_CD, FRM_ID FROM FL_FORMULA.FL_FORMULA WHERE FRM_CD IN (:v0, :v1)',
      binds: { v0: 'F-1', v1: 'F-2' },
    },
    {
      sql: 'SELECT SAP_FAC_CODE, FAC_CODE FROM fl_formula_import.dgo_factory WHERE SAP_FAC_CODE IN (:v0, :v1)',
      binds: { v0: 'P-2', v1: 'P-1' },
    },
  ]);
});

test('reuses cached references on later pages and queries only new codes', async () => {
  const connection = fakeConnection([
    [{ FRM_CD: 'F-1', FRM_ID: 101 }],
    [{ SAP_FAC_CODE: 'P-1', FAC_CODE: 'FAC-A' }],
    [{ FRM_CD: 'F-2', FRM_ID: 202 }],
    [{ SAP_FAC_CODE: 'P-2', FAC_CODE: 'FAC-B' }],
  ]);
  const resolvePage = createReferenceResolver(connection);
  await resolvePage([{ r_i_formula_code: 'F-1', plant_code: 'P-1' }]);

  const references = await resolvePage([
    { r_i_formula_code: 'F-1', plant_code: 'P-2' },
    { r_i_formula_code: 'F-2', plant_code: 'P-1' },
  ]);

  assert.deepEqual(references, [
    { frmId: 101, facCode: 'FAC-B' },
    { frmId: 202, facCode: 'FAC-A' },
  ]);
  assert.deepEqual(connection.calls.slice(2), [
    {
      sql: 'SELECT FRM_CD, FRM_ID FROM FL_FORMULA.FL_FORMULA WHERE FRM_CD IN (:v0)',
      binds: { v0: 'F-2' },
    },
    {
      sql: 'SELECT SAP_FAC_CODE, FAC_CODE FROM fl_formula_import.dgo_factory WHERE SAP_FAC_CODE IN (:v0)',
      binds: { v0: 'P-2' },
    },
  ]);
});

test('caches absent codes as null and never queries them again', async () => {
  const connection = fakeConnection([[], []]);
  const resolvePage = createReferenceResolver(connection);

  assert.deepEqual(
    await resolvePage([{ r_i_formula_code: 'NO-FORMULA', plant_code: 'NO-PLANT' }]),
    [{ frmId: null, facCode: null }],
  );
  assert.deepEqual(
    await resolvePage([{ r_i_formula_code: 'NO-FORMULA', plant_code: 'NO-PLANT' }]),
    [{ frmId: null, facCode: null }],
  );
  assert.equal(connection.calls.length, 2);
});
