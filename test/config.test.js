const assert = require('node:assert/strict');
const test = require('node:test');

const { loadConfig } = require('../src/config');

test('loadConfig returns structured configuration when all variables exist', () => {
  const env = {
    TOKEN_URL: 'https://auth.example.com/token',
    API_URL: 'https://api.example.com',
    CLIENT_ID: 'client-id',
    CLIENT_SECRET: 'client-secret',
    SCOPE: 'imports.write',
    ORACLE_USER: 'importer',
    ORACLE_PASSWORD: 'oracle-password',
    ORACLE_CONNECT_STRING: 'db.example.com/service',
  };

  assert.deepEqual(loadConfig(env), {
    oauth: {
      tokenUrl: env.TOKEN_URL,
      clientId: env.CLIENT_ID,
      clientSecret: env.CLIENT_SECRET,
      scope: env.SCOPE,
    },
    api: {
      url: env.API_URL,
    },
    oracle: {
      user: env.ORACLE_USER,
      password: env.ORACLE_PASSWORD,
      connectString: env.ORACLE_CONNECT_STRING,
    },
  });
});

test('loadConfig reports missing variables in deterministic order', () => {
  const env = {
    TOKEN_URL: 'https://auth.example.com/token',
    API_URL: 'https://api.example.com',
    CLIENT_ID: 'client-id',
    CLIENT_SECRET: 'client-secret',
    ORACLE_USER: 'importer',
    ORACLE_CONNECT_STRING: 'db.example.com/service',
  };

  assert.throws(
    () => loadConfig(env),
    new Error("Variables d'environnement manquantes: SCOPE, ORACLE_PASSWORD"),
  );
});
