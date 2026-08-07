const path = require('node:path');
const fs = require('node:fs/promises');

function logFileName(date) {
  return `import-${date.toISOString().replace(/[:.]/g, '-')}.jsonl`;
}

async function createFileLogger({
  logsDir = 'logs',
  now = () => new Date(),
  mkdir = fs.mkdir,
  appendFile = fs.appendFile,
  consoleRef = console,
} = {}) {
  await mkdir(logsDir, { recursive: true });
  const filePath = path.join(logsDir, logFileName(now()));
  let writeChain = Promise.resolve();

  function write(level, entry) {
    consoleRef[level]?.(entry);
    const record = { timestamp: now().toISOString(), level, ...entry };
    const line = `${JSON.stringify(record)}\n`;
    writeChain = writeChain.then(() => appendFile(filePath, line, 'utf8'));
    return writeChain;
  }

  return {
    filePath,
    info: (entry) => write('info', entry),
    warn: (entry) => write('warn', entry),
    error: (entry) => write('error', entry),
  };
}

module.exports = { createFileLogger };
