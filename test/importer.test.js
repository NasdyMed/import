const assert = require('node:assert/strict');
const test = require('node:test');

const { runImport } = require('../src/importer');

function event(overrides = {}) {
  return {
    r_i_formula_code: 'FORM-001',
    plant_code: 'PLANT-001',
    plant_name: 'Paris Plant',
    first_batch_date: '2025-01-15',
    last_batch_date: null,
    plant_declared_formula_status_text: 'In Production',
    plant_sap_formula_status_text: 'In Production',
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
    event: 'rejected_item',
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

test('logs commit progress and the fatal error with the last processed page', async () => {
  const entries = [];
  const databaseError = Object.assign(
    new Error('ORA-12899: password=top-secret Bearer oauth-token'),
    {
    code: 'ORA-12899',
    errorNum: 12899,
    },
  );
  const sddsClient = {
    async *pages() {
      yield { pageNumber: 1, data: [] };
      yield { pageNumber: 2, data: [] };
    },
  };
  let inserts = 0;
  const repository = {
    async insertRows() {
      inserts += 1;
      if (inserts === 2) throw databaseError;
    },
    async commit() {},
    async rollback() {},
  };

  await assert.rejects(
    runImport({
      sddsClient,
      resolver: { async resolvePage() { return []; } },
      repository,
      logger: {
        async info(entry) { entries.push({ level: 'info', ...entry }); },
        async error(entry) { entries.push({ level: 'error', ...entry }); },
      },
      commitEveryPages: 1,
    }),
    (error) => error === databaseError,
  );

  assert.deepEqual(entries, [
    { level: 'info', event: 'page_processed', page: 1, received: 0, inserted: 0, rejected: 0 },
    { level: 'info', event: 'transaction_committed', page: 1 },
    {
      level: 'error',
      event: 'import_failed',
      page: 2,
      component: 'oracle',
      code: 'ORA-12899',
      status: null,
      message: 'ORA-12899: password=[REDACTED] Bearer [REDACTED]',
    },
  ]);
});

test('rejection logging is optional and logger failures do not abort the import', async (t) => {
  const loggerCases = [
    ['absent logger', undefined],
    ['rejected warning', { warn() { return Promise.reject(new Error('logger failed')); } }],
  ];

  for (const [name, logger] of loggerCases) {
    await t.test(name, async () => {
      const inserted = [];
      let commits = 0;
      const summary = await runImport({
        sddsClient: {
          async *pages() {
            yield { pageNumber: 1, data: [event({ plant_code: '' }), event()] };
          },
        },
        resolver: {
          async resolvePage() {
            return [{ frmId: 1, facCode: null }, { frmId: 2, facCode: 'FAC-2' }];
          },
        },
        repository: {
          async insertRows(rows) { inserted.push(...rows); },
          async commit() { commits += 1; },
          async rollback() { assert.fail('rollback should not be called'); },
        },
        logger,
      });

      assert.deepEqual(summary, { pages: 1, received: 2, inserted: 1, rejected: 1 });
      assert.equal(inserted.length, 1);
      assert.equal(commits, 1);
    });
  }
});

test('rejects invalid commit thresholds before starting import work', async (t) => {
  for (const commitEveryPages of [0, -1, 1.5, NaN, '20']) {
    await t.test(String(commitEveryPages), async () => {
      let pageCalls = 0;
      let rollbacks = 0;

      await assert.rejects(
        runImport({
          sddsClient: { async *pages() { pageCalls += 1; } },
          resolver: { async resolvePage() { return []; } },
          repository: {
            async insertRows() {},
            async commit() {},
            async rollback() { rollbacks += 1; },
          },
          logger: { warn() {} },
          commitEveryPages,
        }),
        { name: 'RangeError', message: 'commitEveryPages must be a positive integer' },
      );

      assert.equal(pageCalls, 0);
      assert.equal(rollbacks, 0);
    });
  }
});
