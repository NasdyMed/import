const test = require('node:test');
const assert = require('node:assert/strict');

const { main } = require('../src/index');

function createDependencies({ importError } = {}) {
  const calls = [];
  const config = {
    oauth: { tokenUrl: 'https://oauth.invalid', clientId: 'id', clientSecret: 'secret', scope: 'scope' },
    api: { url: 'https://api.invalid' },
    oracle: { user: 'user', password: 'password', connectString: 'database' },
  };
  const http = { kind: 'http' };
  const connection = {
    async close() {
      calls.push(['close']);
    },
  };
  const oracledb = {
    async getConnection(options) {
      calls.push(['getConnection', options]);
      return connection;
    },
  };
  const oauthClient = { kind: 'oauthClient' };
  const sddsClient = { kind: 'sddsClient' };
  const resolver = { kind: 'resolver' };
  const repository = { kind: 'repository' };
  const logger = { warn() {} };
  const sleep = async () => {};
  const summary = { pages: 2, received: 75, inserted: 70, rejected: 5 };

  return {
    calls,
    summary,
    dependencies: {
      loadEnv() {
        calls.push(['loadEnv']);
      },
      loadConfig() {
        calls.push(['loadConfig']);
        return config;
      },
      http,
      oracledb,
      logger,
      sleep,
      createOAuthClient(options) {
        calls.push(['createOAuthClient', options]);
        return oauthClient;
      },
      createSddsClient(options) {
        calls.push(['createSddsClient', options]);
        return sddsClient;
      },
      createReferenceResolver(value) {
        calls.push(['createReferenceResolver', value]);
        return resolver;
      },
      createOracleRepository(value, driver) {
        calls.push(['createOracleRepository', value, driver]);
        return repository;
      },
      async runImport(options) {
        calls.push(['runImport', options]);
        if (importError) throw importError;
        return summary;
      },
    },
    expected: { config, http, oracledb, connection, oauthClient, sddsClient, resolver, repository, logger, sleep },
  };
}

test('main câble les dépendances, exécute l’import, ferme Oracle et retourne le résumé', async () => {
  const { calls, dependencies, expected, summary } = createDependencies();

  const result = await main(dependencies);

  assert.deepEqual(result, summary);
  assert.deepEqual(calls, [
    ['loadEnv'],
    ['loadConfig'],
    ['getConnection', expected.config.oracle],
    ['createOAuthClient', { http: expected.http, ...expected.config.oauth }],
    ['createSddsClient', {
      http: expected.http,
      oauthClient: expected.oauthClient,
      apiUrl: expected.config.api.url,
      sleep: expected.sleep,
    }],
    ['createReferenceResolver', expected.connection],
    ['createOracleRepository', expected.connection, expected.oracledb],
    ['runImport', {
      sddsClient: expected.sddsClient,
      resolver: expected.resolver,
      repository: expected.repository,
      logger: expected.logger,
    }],
    ['close'],
  ]);
});

test('main referme Oracle puis propage une erreur d’import', async () => {
  const importError = new Error('échec import');
  const { calls, dependencies } = createDependencies({ importError });

  await assert.rejects(main(dependencies), (error) => error === importError);

  assert.deepEqual(calls.at(-1), ['close']);
  assert.equal(calls.filter(([name]) => name === 'close').length, 1);
});
