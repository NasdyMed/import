const SQL = `
  INSERT INTO fl_formula_import.dgo_production_event_v2 (
    FRM_ID, FAC_CODE, FAC_LABEL, FRM_LABEL, FAB_DATE, BATCH_CODE,
    FIRST_FAB, LAST_FAB, DEROGATION, START_DEROGATION, END_DEROGATION,
    COMMENT_DEROGATION, SUBCONTRACTED, FULLBUY, PRODUCER_CODE,
    PRODUCER_LABEL, PRODUCER_COUNTRY, UPDATE_DATE, SOURCE, ID_SATURNE,
    FLAG_DELETE_SATURNE, CODE_BATCH_PF, FRM_CD, TIMESTAMP, FIRST_FAB_DATE,
    PLANT_SAP_STATUS, PLANT_DECLARED_STATUS
  ) VALUES (
    :frmId, :facCode, :facLabel, :frmLabel, :fabDate, :batchCode,
    :firstFab, :lastFab, :derogation, :startDerogation, :endDerogation,
    :commentDerogation, :subcontracted, :fullbuy, :producerCode,
    :producerLabel, :producerCountry, :updateDate, :source, :idSaturne,
    :flagDeleteSaturne, :codeBatchPf, :frmCd, SYSDATE, :firstFabDate,
    :plantSapStatus, :plantDeclaredStatus
  )`;

function createOracleRepository(connection, oracledb) {
  const string = (maxSize) => ({ type: oracledb.STRING, maxSize });
  const bindDefs = {
    frmId: { type: oracledb.NUMBER },
    facCode: string(255),
    facLabel: string(4000),
    frmLabel: string(4000),
    fabDate: { type: oracledb.DATE },
    batchCode: string(255),
    firstFab: string(10),
    lastFab: string(10),
    derogation: string(10),
    startDerogation: { type: oracledb.DATE },
    endDerogation: { type: oracledb.DATE },
    commentDerogation: string(4000),
    subcontracted: string(10),
    fullbuy: string(10),
    producerCode: string(255),
    producerLabel: string(4000),
    producerCountry: string(255),
    updateDate: { type: oracledb.DATE },
    source: string(10),
    idSaturne: string(255),
    flagDeleteSaturne: string(10),
    codeBatchPf: string(255),
    frmCd: string(255),
    firstFabDate: { type: oracledb.DATE },
    plantSapStatus: string(255),
    plantDeclaredStatus: string(255),
  };

  return {
    insertRows(rows) {
      if (rows.length === 0) return undefined;
      return connection.executeMany(SQL, rows, {
        autoCommit: false,
        batchErrors: false,
        bindDefs,
      });
    },
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    close: () => connection.close(),
  };
}

module.exports = { createOracleRepository };
