const assert = require('node:assert/strict');
const test = require('node:test');

const { createSddsClient } = require('../src/sdds-client');

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

test('pages streams every page using the initial page count and exact request options', async () => {
  const requests = [];
  const responses = [
    { data: { data: ['one'], page_count: 3 } },
    { data: { data: ['two'], page_count: 99 } },
    { data: { data: ['three'], page_count: 99 } },
  ];
  const client = createSddsClient({
    http: {
      async get(url, options) {
        requests.push({ url, options });
        return responses.shift();
      },
    },
    oauthClient: { async getToken() { return 'token-1'; } },
    apiUrl: 'https://sdds.example.com/events',
    sleep: async () => {},
  });

  assert.deepEqual(await collect(client.pages()), [
    { pageNumber: 1, data: ['one'] },
    { pageNumber: 2, data: ['two'] },
    { pageNumber: 3, data: ['three'] },
  ]);
  assert.deepEqual(requests, [1, 2, 3].map((page) => ({
    url: 'https://sdds.example.com/events',
    options: {
      params: { page_size: 50, page },
      headers: { Authorization: 'Bearer token-1' },
    },
  })));
});

test('pages reuses a refreshed token on following pages', async () => {
  const tokens = ['expired', 'fresh'];
  const authorizations = [];
  let tokenCalls = 0;
  let calls = 0;
  const client = createSddsClient({
    http: {
      async get(_url, options) {
        authorizations.push(options.headers.Authorization);
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('unauthorized'), { response: { status: 401 } });
        return calls === 2
          ? { data: { data: ['first'], page_count: 2 } }
          : { data: { data: ['second'], page_count: 2 } };
      },
    },
    oauthClient: { async getToken() { tokenCalls += 1; return tokens.shift(); } },
    apiUrl: 'https://sdds.example.com/events',
    sleep: async () => {},
  });

  assert.deepEqual(await collect(client.pages()), [
    { pageNumber: 1, data: ['first'] },
    { pageNumber: 2, data: ['second'] },
  ]);
  assert.deepEqual(authorizations, ['Bearer expired', 'Bearer fresh', 'Bearer fresh']);
  assert.equal(tokenCalls, 2);
});

test('pages retries 5xx errors up to maxAttempts with bounded delays', async () => {
  const sleeps = [];
  let calls = 0;
  const client = createSddsClient({
    http: {
      async get() {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error('server error'), { response: { status: 500 } });
        return { data: { data: ['event'], page_count: 1 } };
      },
    },
    oauthClient: { async getToken() { return 'token'; } },
    apiUrl: 'https://sdds.example.com/events',
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  });

  assert.deepEqual(await collect(client.pages()), [{ pageNumber: 1, data: ['event'] }]);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [250, 500]);
});

test('pages retries HTTP 429 then succeeds after the expected delay', async () => {
  const sleeps = [];
  let calls = 0;
  const client = createSddsClient({
    http: {
      async get() {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('rate limited'), { response: { status: 429 } });
        return { data: { data: ['event'], page_count: 1 } };
      },
    },
    oauthClient: { async getToken() { return 'token'; } },
    apiUrl: 'https://sdds.example.com/events',
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  });

  assert.deepEqual(await collect(client.pages()), [{ pageNumber: 1, data: ['event'] }]);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [250]);
});

test('pages propagates the final error after exhausting retry attempts', async () => {
  const sleeps = [];
  const finalError = Object.assign(new Error('still unavailable'), { response: { status: 503 } });
  let calls = 0;
  const client = createSddsClient({
    http: {
      async get() {
        calls += 1;
        throw finalError;
      },
    },
    oauthClient: { async getToken() { return 'token'; } },
    apiUrl: 'https://sdds.example.com/events',
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    maxAttempts: 3,
  });

  await assert.rejects(() => collect(client.pages()), (error) => error === finalError);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [250, 500]);
});

test('pages propagates a repeated 401 after one token refresh', async () => {
  const repeatedUnauthorized = Object.assign(new Error('still unauthorized'), { response: { status: 401 } });
  let tokenCalls = 0;
  let calls = 0;
  const client = createSddsClient({
    http: {
      async get() {
        calls += 1;
        throw repeatedUnauthorized;
      },
    },
    oauthClient: { async getToken() { tokenCalls += 1; return `token-${tokenCalls}`; } },
    apiUrl: 'https://sdds.example.com/events',
    sleep: async () => {},
  });

  await assert.rejects(() => collect(client.pages()), (error) => error === repeatedUnauthorized);
  assert.equal(calls, 2);
  assert.equal(tokenCalls, 2);
});

test('pages rejects a response whose data field is not an array', async () => {
  const client = createSddsClient({
    http: { async get() { return { data: { data: 'not-an-array', page_count: 1 } }; } },
    oauthClient: { async getToken() { return 'token'; } },
    apiUrl: 'https://sdds.example.com/events',
    sleep: async () => {},
  });

  await assert.rejects(() => collect(client.pages()), new Error('SDDS response data must be an array'));
});

test('pages rejects an invalid first-response page count', async () => {
  const client = createSddsClient({
    http: { async get() { return { data: { data: [], page_count: 0 } }; } },
    oauthClient: { async getToken() { return 'token'; } },
    apiUrl: 'https://sdds.example.com/events',
    sleep: async () => {},
  });

  await assert.rejects(
    () => collect(client.pages()),
    new Error('SDDS response page_count must be an integer greater than or equal to 1'),
  );
});
