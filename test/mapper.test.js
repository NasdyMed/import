const assert = require('node:assert/strict');
const test = require('node:test');

const { mapEvent } = require('../src/mapper');

const references = { frmId: 42, facCode: 'FAC-001' };

function event(overrides = {}) {
  return {
    plant_name: 'Paris Plant',
    r_i_formula_code: 'FORM-001',
    plant_declared_formula_status_text: null,
    plant_sap_formula_status_text: 'In Production',
    first_batch_date: '2025-01-15',
    last_batch_date: '2025-02-20',
    ...overrides,
  };
}

test('maps In Production from the declared status and preserves original statuses', () => {
  const result = mapEvent(event({
    plant_declared_formula_status_text: '  iN pRoDuCtIoN  ',
    plant_sap_formula_status_text: 'End Production',
  }), references);

  assert.equal(result.ok, true);
  assert.deepEqual(result.row.fabDate, new Date(2025, 0, 15));
  assert.equal(result.row.firstFab, 'O');
  assert.equal(result.row.lastFab, 'N');
  assert.equal(result.row.firstFabDate, null);
  assert.equal(result.row.plantDeclaredStatus, '  iN pRoDuCtIoN  ');
  assert.equal(result.row.plantSapStatus, 'End Production');
});

for (const declaredStatus of [null, '', '   ']) {
  test(`falls back to SAP status when declared status is ${JSON.stringify(declaredStatus)}`, () => {
    const result = mapEvent(event({
      plant_declared_formula_status_text: declaredStatus,
      plant_sap_formula_status_text: '  eNd PrOdUcTiOn ',
    }), references);

    assert.equal(result.ok, true);
    assert.deepEqual(result.row.fabDate, new Date(2025, 1, 20));
    assert.equal(result.row.firstFab, 'O');
    assert.equal(result.row.lastFab, 'O');
    assert.equal(result.row.firstFabDate, null);
    assert.equal(result.row.plantDeclaredStatus, declaredStatus);
    assert.equal(result.row.plantSapStatus, '  eNd PrOdUcTiOn ');
  });
}

test('normalizes undefined declared and SAP status values to null in the row', () => {
  const input = event();
  delete input.plant_declared_formula_status_text;
  const result = mapEvent(input, references);

  assert.equal(result.ok, true);
  assert.equal(result.row.plantDeclaredStatus, null);
  assert.equal(result.row.plantSapStatus, 'In Production');

  const declaredInput = event({ plant_declared_formula_status_text: 'In Production' });
  delete declaredInput.plant_sap_formula_status_text;
  const declaredResult = mapEvent(declaredInput, references);

  assert.equal(declaredResult.ok, true);
  assert.equal(declaredResult.row.plantDeclaredStatus, 'In Production');
  assert.equal(declaredResult.row.plantSapStatus, null);
});

test('rejects an event without an effective production status', () => {
  for (const statuses of [
    { plant_declared_formula_status_text: null, plant_sap_formula_status_text: null },
    { plant_declared_formula_status_text: ' ', plant_sap_formula_status_text: '' },
  ]) {
    assert.deepEqual(mapEvent(event(statuses), references), {
      ok: false,
      reason: 'missing_production_status',
    });
  }
});

test('rejects an unsupported effective production status', () => {
  assert.deepEqual(mapEvent(event({
    plant_declared_formula_status_text: 'Planned',
    plant_sap_formula_status_text: 'In Production',
  }), references), { ok: false, reason: 'unsupported_production_status' });
});

test('requires first_batch_date for In Production', () => {
  assert.deepEqual(mapEvent(event({ first_batch_date: null }), references), {
    ok: false,
    reason: 'missing_first_batch_date_for_in_production',
  });
});

test('requires last_batch_date for End Production', () => {
  assert.deepEqual(mapEvent(event({
    plant_declared_formula_status_text: 'End Production',
    last_batch_date: null,
  }), references), {
    ok: false,
    reason: 'missing_last_batch_date_for_end_production',
  });
});

test('validates every non-null date, including the date not selected by the status', () => {
  assert.deepEqual(mapEvent(event({ last_batch_date: '2025-02-30' }), references), {
    ok: false,
    reason: 'Invalid last_batch_date',
  });
  assert.deepEqual(mapEvent(event({
    plant_declared_formula_status_text: 'End Production',
    first_batch_date: '2025-02-30',
  }), references), { ok: false, reason: 'Invalid first_batch_date' });
});

test('rejects malformed dates and year zero with the existing validation reasons', () => {
  assert.deepEqual(mapEvent(event({ first_batch_date: '2025-1-15' }), references), {
    ok: false,
    reason: 'Invalid first_batch_date',
  });
  assert.deepEqual(mapEvent(event({ first_batch_date: '0000-01-01' }), references), {
    ok: false,
    reason: 'Invalid first_batch_date',
  });
});

test('creates the selected Oracle date bind at local midnight', () => {
  const result = mapEvent(event(), references);

  assert.equal(result.ok, true);
  assert.deepEqual([
    result.row.fabDate.getFullYear(),
    result.row.fabDate.getMonth(),
    result.row.fabDate.getDate(),
    result.row.fabDate.getHours(),
    result.row.fabDate.getMinutes(),
    result.row.fabDate.getSeconds(),
    result.row.fabDate.getMilliseconds(),
  ], [2025, 0, 15, 0, 0, 0, 0]);
});
