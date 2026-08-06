const assert = require('node:assert/strict');
const test = require('node:test');

const { mapEvent } = require('../src/mapper');

const references = {
  frmId: 42,
  facCode: 'FAC-001',
};

test('mapEvent maps an event with both production dates', () => {
  const result = mapEvent(
    {
      plant_name: 'Paris Plant',
      r_i_formula_code: 'FORM-001',
      first_batch_date: '2025-01-15',
      last_batch_date: '2025-02-20',
    },
    references,
  );

  assert.deepEqual(result, {
    ok: true,
    row: {
      frmId: 42,
      facCode: 'FAC-001',
      facLabel: 'Paris Plant',
      frmLabel: null,
      fabDate: new Date('2025-02-20T00:00:00.000Z'),
      batchCode: null,
      firstFab: 'O',
      lastFab: 'O',
      derogation: null,
      startDerogation: null,
      endDerogation: null,
      commentDerogation: null,
      subcontracted: null,
      fullbuy: null,
      producerCode: null,
      producerLabel: null,
      producerCountry: null,
      updateDate: null,
      idSaturne: null,
      flagDeleteSaturne: null,
      codeBatchPf: null,
      source: 'SDDS',
      frmCd: 'FORM-001',
      firstFabDate: new Date('2025-01-15T00:00:00.000Z'),
    },
  });
});

test('mapEvent falls back to the first date when the last date is absent', () => {
  const result = mapEvent(
    {
      plant_name: 'Paris Plant',
      r_i_formula_code: 'FORM-001',
      first_batch_date: '2025-01-15',
      last_batch_date: null,
    },
    references,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.row.fabDate, new Date('2025-01-15T00:00:00.000Z'));
  assert.equal(result.row.firstFab, 'O');
  assert.equal(result.row.lastFab, 'N');
});

test('mapEvent preserves null dates and marks both production flags absent', () => {
  const result = mapEvent(
    {
      plant_name: 'Paris Plant',
      r_i_formula_code: 'FORM-001',
      first_batch_date: null,
      last_batch_date: null,
    },
    references,
  );

  assert.equal(result.ok, true);
  assert.equal(result.row.fabDate, null);
  assert.equal(result.row.firstFabDate, null);
  assert.equal(result.row.firstFab, 'N');
  assert.equal(result.row.lastFab, 'N');
});

test('mapEvent rejects an invalid non-null last date', () => {
  assert.deepEqual(
    mapEvent(
      {
        plant_name: 'Paris Plant',
        r_i_formula_code: 'FORM-001',
        first_batch_date: '2025-01-15',
        last_batch_date: '2025-02-30',
      },
      references,
    ),
    { ok: false, reason: 'Invalid last_batch_date' },
  );
});
