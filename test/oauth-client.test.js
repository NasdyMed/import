const assert = require('node:assert/strict');
const test = require('node:test');

const { createOAuthClient } = require('../src/oauth-client');

test('getToken requests and returns an OAuth client credentials token', async () => {
  const requests = [];
  const http = {
    async post(url, body, options) {
      requests.push({ url, body, options });
      return { data: { access_token: 'access-token' } };
    },
  };
  const client = createOAuthClient({
    http,
    tokenUrl: 'https://auth.example.com/token',
    clientId: 'client id',
    clientSecret: 'client&secret',
    scope: 'imports.write imports.read',
  });

  const token = await client.getToken();

  assert.equal(token, 'access-token');
  assert.deepEqual(requests, [
    {
      url: 'https://auth.example.com/token',
      body: 'grant_type=client_credentials&client_id=client+id&client_secret=client%26secret&scope=imports.write+imports.read',
      options: {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    },
  ]);
});

test('getToken rejects an OAuth response without a non-empty access token', async () => {
  for (const accessToken of [undefined, '']) {
    const http = {
      async post() {
        return { data: { access_token: accessToken } };
      },
    };
    const client = createOAuthClient({
      http,
      tokenUrl: 'https://auth.example.com/token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scope: 'imports.write',
    });

    await assert.rejects(
      () => client.getToken(),
      new Error('OAuth response does not contain access_token'),
    );
  }
});
