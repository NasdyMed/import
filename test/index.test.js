const test = require('node:test');
const assert = require('node:assert/strict');

const { main, resolveDependencies, runCli } = require('../src/index');

function createDependencies({ importError, closeError } = {}) {
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
      if (closeError) throw closeError;
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

test('main conserve l’erreur d’import exacte et lui attache l’erreur de fermeture', async () => {
  const importError = new Error('échec import');
  const closeError = new Error('échec fermeture');
  const { dependencies } = createDependencies({ importError, closeError });

  await assert.rejects(main(dependencies), (error) => {
    assert.equal(error, importError);
    assert.equal(error.closeError, closeError);
    return true;
  });
});

test('main ne remplace pas un closeError existant et utilise cause', async () => {
  const existingCloseError = new Error('fermeture précédente');
  const importError = Object.assign(new Error('échec import'), { closeError: existingCloseError });
  const closeError = new Error('échec fermeture actuel');
  const { dependencies } = createDependencies({ importError, closeError });

  await assert.rejects(main(dependencies), (error) => {
    assert.equal(error, importError);
    assert.equal(error.closeError, existingCloseError);
    assert.equal(error.cause, closeError);
    return true;
  });
});

test('main propage l’erreur de fermeture lorsque l’import réussit', async () => {
  const closeError = new Error('échec fermeture');
  const { dependencies } = createDependencies({ closeError });

  await assert.rejects(main(dependencies), (error) => error === closeError);
});

test('resolveDependencies charge les modules par requireFn et configure dotenv silencieusement', () => {
  const required = [];
  const dotenvCalls = [];
  const modules = {
    dotenv: { config(options) { dotenvCalls.push(options); } },
    './config': { loadConfig: () => {} },
    axios: { kind: 'http' },
    oracledb: { kind: 'oracle' },
    './oauth-client': { createOAuthClient: () => {} },
    './sdds-client': { createSddsClient: () => {} },
    './reference-resolver': { createReferenceResolver: () => {} },
    './oracle-repository': { createOracleRepository: () => {} },
    './importer': { runImport: () => {} },
  };
  const requireFn = (name) => {
    required.push(name);
    return modules[name];
  };

  const dependencies = resolveDependencies({}, requireFn);
  dependencies.loadEnv();

  assert.deepEqual(required, [
    './config',
    'axios',
    'oracledb',
    './oauth-client',
    './sdds-client',
    './reference-resolver',
    './oracle-repository',
    './importer',
    'dotenv',
  ]);
  assert.deepEqual(dotenvCalls, [{ quiet: true }]);
});

test('runCli affiche le résumé JSON en succès', async () => {
  const output = [];
  const processRef = { exitCode: undefined };
  const summary = { pages: 1, received: 2, inserted: 2, rejected: 0 };

  await runCli(async () => summary, { log: (value) => output.push(value), error() {} }, processRef);

  assert.deepEqual(output, [JSON.stringify(summary)]);
  assert.equal(processRef.exitCode, undefined);
});

test('runCli masque l’erreur et fixe le code de sortie', async () => {
  const stdout = [];
  const stderr = [];
  const processRef = { exitCode: undefined };

  await runCli(
    async () => { throw new Error('secret=très-sensible'); },
    { log: (value) => stdout.push(value), error: (value) => stderr.push(value) },
    processRef,
  );

  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['Échec de l’import SDDS vers Oracle']);
  assert.equal(processRef.exitCode, 1);
});
