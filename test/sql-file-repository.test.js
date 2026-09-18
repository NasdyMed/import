const test = require('node:test');
const assert = require('node:assert/strict');

const { rowToInsert } = require('../src/sql-file-repository');

test('rowToInsert exports SDDS statuses after FIRST_FAB_DATE and escapes apostrophes', () => {
  const sql = rowToInsert({
    firstFabDate: null,
    plantSapStatus: 'End Production',
    plantDeclaredStatus: "Production d'essai",
  });

  assert.match(
    sql,
    /FIRST_FAB_DATE, PLANT_SAP_STATUS, PLANT_DECLARED_STATUS\)\nVALUES \([^\n]*NULL, 'End Production', 'Production d''essai'\);$/,
  );
});
