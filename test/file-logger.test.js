const test = require('node:test');
const assert = require('node:assert/strict');

const { createFileLogger } = require('../src/file-logger');

test('createFileLogger writes JSONL and mirrors entries to the console', async () => {
  const writes = [];
  const consoleCalls = [];
  const logger = await createFileLogger({
    logsDir: 'logs',
    now: () => new Date('2026-08-07T10:11:12.000Z'),
    mkdir: async (path, options) => writes.push(['mkdir', path, options]),
    appendFile: async (path, content) => writes.push(['appendFile', path, content]),
    consoleRef: {
      info: (entry) => consoleCalls.push(['info', entry]),
      warn: (entry) => consoleCalls.push(['warn', entry]),
      error: (entry) => consoleCalls.push(['error', entry]),
    },
  });

  await logger.warn({ event: 'rejected_item', page: 829, reason: 'unresolved_plant_code' });

  assert.deepEqual(writes[0], ['mkdir', 'logs', { recursive: true }]);
  assert.equal(logger.filePath, 'logs\\import-2026-08-07T10-11-12-000Z.jsonl');
  assert.equal(writes[1][0], 'appendFile');
  assert.equal(writes[1][1], logger.filePath);
  assert.deepEqual(JSON.parse(writes[1][2]), {
    timestamp: '2026-08-07T10:11:12.000Z',
    level: 'warn',
    event: 'rejected_item',
    page: 829,
    reason: 'unresolved_plant_code',
  });
  assert.equal(writes[1][2].endsWith('\n'), true);
  assert.deepEqual(consoleCalls, [[
    'warn',
    { event: 'rejected_item', page: 829, reason: 'unresolved_plant_code' },
  ]]);
});

test('createFileLogger serializes concurrent writes in call order', async () => {
  const contents = [];
  const logger = await createFileLogger({
    logsDir: 'logs',
    now: () => new Date('2026-08-07T10:11:12.000Z'),
    mkdir: async () => {},
    appendFile: async (_path, content) => contents.push(JSON.parse(content).event),
    consoleRef: { info() {}, warn() {}, error() {} },
  });

  await Promise.all([
    logger.info({ event: 'first' }),
    logger.error({ event: 'second' }),
  ]);

  assert.deepEqual(contents, ['first', 'second']);
});
