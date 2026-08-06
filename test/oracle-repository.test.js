const assert = require('node:assert/strict');
const test = require('node:test');

const { createOracleRepository } = require('../src/oracle-repository');

const oracledb = { NUMBER: 'NUMBER', STRING: 'STRING', DATE: 'DATE' };

function createConnection(overrides = {}) {
  return {
    executeMany: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    close: async () => undefined,
    ...overrides,
  };
}

test('insertRows does not call executeMany for an empty array', async () => {
  let calls = 0;
  const repository = createOracleRepository(
    createConnection({ executeMany: async () => { calls += 1; } }),
    oracledb,
  );

  await repository.insertRows([]);

  assert.equal(calls, 0);
});

test('insertRows bulk inserts mapped rows with the required SQL and bind options', async () => {
  const calls = [];
  const connection = createConnection({
    executeMany: async (...args) => { calls.push(args); return { rowsAffected: 1 }; },
  });
  const row = {
    frmId: 42, facCode: 'FAC-1', facLabel: 'Factory', frmLabel: null,
    fabDate: new Date('2025-02-20T00:00:00Z'), batchCode: null,
    firstFab: 'O', lastFab: 'O', derogation: null, startDerogation: null,
    endDerogation: null, commentDerogation: null, subcontracted: null,
    fullbuy: null, producerCode: null, producerLabel: null,
    producerCountry: null, updateDate: null, source: 'SDDS', idSaturne: null,
    flagDeleteSaturne: null, codeBatchPf: null, frmCd: 'FORM-1',
    firstFabDate: new Date('2025-01-15T00:00:00Z'),
  };

  const result = await createOracleRepository(connection, oracledb).insertRows([row]);

  assert.deepEqual(result, { rowsAffected: 1 });
  assert.equal(calls.length, 1);
  const [sql, rows, options] = calls[0];
  const columns = sql.match(/\(([^)]+)\)\s*VALUES/s)[1]
    .split(',').map((column) => column.trim());
  assert.deepEqual(columns, [
    'FRM_ID', 'FAC_CODE', 'FAC_LABEL', 'FRM_LABEL', 'FAB_DATE', 'BATCH_CODE',
    'FIRST_FAB', 'LAST_FAB', 'DEROGATION', 'START_DEROGATION', 'END_DEROGATION',
    'COMMENT_DEROGATION', 'SUBCONTRACTED', 'FULLBUY', 'PRODUCER_CODE',
    'PRODUCER_LABEL', 'PRODUCER_COUNTRY', 'UPDATE_DATE', 'SOURCE', 'ID_SATURNE',
    'FLAG_DELETE_SATURNE', 'CODE_BATCH_PF', 'FRM_CD', 'TIMESTAMP', 'FIRST_FAB_DATE',
  ]);
  assert.match(sql, /INSERT INTO fl_formula_import\.dgo_production_event_v2/i);
  assert.match(sql, /:frmCd\s*,\s*SYSDATE\s*,\s*:firstFabDate/i);
  assert.deepEqual(rows, [row]);
  assert.deepEqual(options, {
    autoCommit: false,
    batchErrors: false,
    bindDefs: {
      frmId: { type: 'NUMBER' }, facCode: { type: 'STRING', maxSize: 255 },
      facLabel: { type: 'STRING', maxSize: 4000 }, frmLabel: { type: 'STRING', maxSize: 4000 },
      fabDate: { type: 'DATE' }, batchCode: { type: 'STRING', maxSize: 255 },
      firstFab: { type: 'STRING', maxSize: 10 }, lastFab: { type: 'STRING', maxSize: 10 },
      derogation: { type: 'STRING', maxSize: 10 }, startDerogation: { type: 'DATE' },
      endDerogation: { type: 'DATE' }, commentDerogation: { type: 'STRING', maxSize: 4000 },
      subcontracted: { type: 'STRING', maxSize: 10 }, fullbuy: { type: 'STRING', maxSize: 10 },
      producerCode: { type: 'STRING', maxSize: 255 }, producerLabel: { type: 'STRING', maxSize: 4000 },
      producerCountry: { type: 'STRING', maxSize: 255 }, updateDate: { type: 'DATE' },
      source: { type: 'STRING', maxSize: 10 }, idSaturne: { type: 'STRING', maxSize: 255 },
      flagDeleteSaturne: { type: 'STRING', maxSize: 10 }, codeBatchPf: { type: 'STRING', maxSize: 255 },
      frmCd: { type: 'STRING', maxSize: 255 }, firstFabDate: { type: 'DATE' },
    },
  });
});

test('commit, rollback, and close delegate to the connection', async () => {
  const calls = [];
  const repository = createOracleRepository(createConnection({
    commit: async () => { calls.push('commit'); return 'committed'; },
    rollback: async () => { calls.push('rollback'); return 'rolled back'; },
    close: async () => { calls.push('close'); return 'closed'; },
  }), oracledb);

  assert.equal(await repository.commit(), 'committed');
  assert.equal(await repository.rollback(), 'rolled back');
  assert.equal(await repository.close(), 'closed');
  assert.deepEqual(calls, ['commit', 'rollback', 'close']);
});

test('insertRows propagates executeMany failures', async () => {
  const failure = new Error('Oracle bulk insert failed');
  const repository = createOracleRepository(createConnection({
    executeMany: async () => { throw failure; },
  }), oracledb);

  await assert.rejects(repository.insertRows([{ frmId: 1 }]), failure);
});
