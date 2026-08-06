const assert = require('node:assert/strict');
const test = require('node:test');

const { runImport } = require('../src/importer');

function event(overrides = {}) {
  return {
    r_i_formula_code: 'FORM-001',
    plant_code: 'PLANT-001',
    plant_name: 'Paris Plant',
    first_batch_date: null,
    last_batch_date: null,
    ...overrides,
  };
}

test('streams 21 pages, inserts each page, and commits at the threshold and natural end', async () => {
  async function* pages() {
    for (let pageNumber = 1; pageNumber <= 21; pageNumber += 1) {
      yield { pageNumber, data: [event({ r_i_formula_code: `FORM-${pageNumber}` })] };
    }
  }

  const calls = [];
  const repository = {
    async insertRows(rows) { calls.push(['insert', rows]); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
  };

  const summary = await runImport({
    sddsClient: { pages },
    resolver: { async resolvePage(events) { return events.map(() => ({ frmId: 42, facCode: 'FAC-1' })); } },
    repository,
    logger: { warn() {} },
  });

  assert.deepEqual(summary, { pages: 21, received: 21, inserted: 21, rejected: 0 });
  assert.equal(calls.filter(([name]) => name === 'insert').length, 21);
  assert.deepEqual(calls.map(([name]) => name), [
    ...Array(20).fill('insert'),
    'commit',
    'insert',
    'commit',
  ]);
});

test('rejects missing and unresolved references plus invalid mappings while inserting valid rows', async () => {
  const data = [
    event({ r_i_formula_code: '  ' }),
    event({ plant_code: '' }),
    event({ r_i_formula_code: 'UNKNOWN-FORM' }),
    event({ plant_code: 'UNKNOWN-PLANT' }),
    event({ last_batch_date: '2025-02-30' }),
    event({ r_i_formula_code: 'VALID' }),
  ];
  const references = [
    { frmId: null, facCode: 'FAC-1' },
    { frmId: 1, facCode: null },
    { frmId: null, facCode: 'FAC-1' },
    { frmId: 1, facCode: null },
    { frmId: 1, facCode: 'FAC-1' },
    { frmId: 2, facCode: 'FAC-2' },
  ];
  const inserted = [];
  const warnings = [];
  let resolveCalls = 0;
  let commits = 0;

  const summary = await runImport({
    sddsClient: { async *pages() { yield { pageNumber: 7, data }; } },
    resolver: { async resolvePage(events) { resolveCalls += 1; assert.equal(events, data); return references; } },
    repository: {
      async insertRows(rows) { inserted.push(rows); },
      async commit() { commits += 1; },
      async rollback() { assert.fail('rollback should not be called'); },
    },
    logger: { warn(value) { warnings.push(value); } },
  });

  assert.deepEqual(summary, { pages: 1, received: 6, inserted: 1, rejected: 5 });
  assert.equal(resolveCalls, 1);
  assert.equal(commits, 1);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].length, 1);
  assert.equal(inserted[0][0].frmCd, 'VALID');
  assert.deepEqual(warnings.map(({ reason }) => reason), [
    'missing_formula_code',
    'missing_plant_code',
    'unresolved_formula_code',
    'unresolved_plant_code',
    'Invalid last_batch_date',
  ]);
  assert.deepEqual(warnings[0], {
    page: 7,
    r_i_formula_code: '  ',
    plant_code: 'PLANT-001',
    reason: 'missing_formula_code',
  });
});

test('rolls back and propagates an insertion failure without committing', async () => {
  const insertionError = new Error('insert failed');
  let rollbacks = 0;
  let commits = 0;

  await assert.rejects(
    runImport({
      sddsClient: { async *pages() { yield { pageNumber: 1, data: [event()] }; } },
      resolver: { async resolvePage() { return [{ frmId: 1, facCode: 'FAC-1' }]; } },
      repository: {
        async insertRows() { throw insertionError; },
        async commit() { commits += 1; },
        async rollback() { rollbacks += 1; },
      },
      logger: { warn() {} },
    }),
    (error) => error === insertionError,
  );

  assert.equal(rollbacks, 1);
  assert.equal(commits, 0);
});
