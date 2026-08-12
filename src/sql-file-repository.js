const fs = require('node:fs/promises');
const path = require('node:path');

const COLUMNS = [
  ['FRM_ID', 'frmId'],
  ['FAC_CODE', 'facCode'],
  ['FAC_LABEL', 'facLabel'],
  ['FRM_LABEL', 'frmLabel'],
  ['FAB_DATE', 'fabDate'],
  ['BATCH_CODE', 'batchCode'],
  ['FIRST_FAB', 'firstFab'],
  ['LAST_FAB', 'lastFab'],
  ['DEROGATION', 'derogation'],
  ['START_DEROGATION', 'startDerogation'],
  ['END_DEROGATION', 'endDerogation'],
  ['COMMENT_DEROGATION', 'commentDerogation'],
  ['SUBCONTRACTED', 'subcontracted'],
  ['FULLBUY', 'fullbuy'],
  ['PRODUCER_CODE', 'producerCode'],
  ['PRODUCER_LABEL', 'producerLabel'],
  ['PRODUCER_COUNTRY', 'producerCountry'],
  ['UPDATE_DATE', 'updateDate'],
  ['SOURCE', 'source'],
  ['ID_SATURNE', 'idSaturne'],
  ['FLAG_DELETE_SATURNE', 'flagDeleteSaturne'],
  ['CODE_BATCH_PF', 'codeBatchPf'],
  ['FRM_CD', 'frmCd'],
  ['TIMESTAMP', null],
  ['FIRST_FAB_DATE', 'firstFabDate'],
];

function padPage(pageNumber) {
  return String(pageNumber).padStart(4, '0');
}

function formatDate(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) {
    return `TO_DATE('${formatDate(value)}', 'YYYY-MM-DD')`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Impossible de sérialiser un nombre non fini');
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function rowToInsert(row) {
  const columnNames = COLUMNS.map(([column]) => column).join(', ');
  const values = COLUMNS.map(([, property]) => (
    property === null ? 'SYSDATE' : sqlLiteral(row[property])
  )).join(', ');
  return `INSERT INTO fl_formula_import.dgo_production_event_v2 (${columnNames})\nVALUES (${values});`;
}

function createSqlFileRepository({
  outputDir = 'sql',
  pagesPerFile = 20,
  mkdir = fs.mkdir,
  writeFile = fs.writeFile,
  logger,
} = {}) {
  let firstPage = null;
  let lastPage = null;
  let pagesInFile = 0;
  let rows = [];

  async function flush() {
    if (firstPage === null) return;
    await mkdir(outputDir, { recursive: true });
    const fileName = `import-pages-${padPage(firstPage)}-${padPage(lastPage)}.sql`;
    const filePath = path.join(outputDir, fileName);
    const header = `-- Pages API ${firstPage} à ${lastPage}\n`;
    const statements = rows.map(rowToInsert).join('\n\n');
    const content = `${header}${statements}${statements ? '\n\n' : ''}COMMIT;\n/\n`;
    await writeFile(filePath, content, 'utf8');
    if (typeof logger?.info === 'function') {
      try {
        await logger.info({
          event: 'sql_file_generated',
          firstPage,
          lastPage,
          filePath,
          rows: rows.length,
        });
      } catch {
        // La génération SQL ne doit pas échouer à cause du journal.
      }
    }
    firstPage = null;
    lastPage = null;
    pagesInFile = 0;
    rows = [];
  }

  return {
    mode: 'dev',
    insertRows(newRows) {
      rows.push(...newRows);
    },
    async completePage(pageNumber) {
      if (firstPage === null) firstPage = pageNumber;
      lastPage = pageNumber;
      pagesInFile += 1;
      if (pagesInFile === pagesPerFile) await flush();
    },
    finish: flush,
    commit() {},
    rollback() {},
  };
}

module.exports = { createSqlFileRepository, rowToInsert, sqlLiteral };
