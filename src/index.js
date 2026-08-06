function resolveDependencies(dependencies) {
  return {
    loadEnv: dependencies.loadEnv ?? (() => require('dotenv').config({ quiet: true })),
    loadConfig: dependencies.loadConfig ?? require('./config').loadConfig,
    http: dependencies.http ?? require('axios'),
    oracledb: dependencies.oracledb ?? require('oracledb'),
    createOAuthClient: dependencies.createOAuthClient ?? require('./oauth-client').createOAuthClient,
    createSddsClient: dependencies.createSddsClient ?? require('./sdds-client').createSddsClient,
    createReferenceResolver:
      dependencies.createReferenceResolver ?? require('./reference-resolver').createReferenceResolver,
    createOracleRepository:
      dependencies.createOracleRepository ?? require('./oracle-repository').createOracleRepository,
    runImport: dependencies.runImport ?? require('./importer').runImport,
    logger: dependencies.logger ?? console,
    sleep:
      dependencies.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  };
}

async function main(dependencies = {}) {
  const deps = resolveDependencies(dependencies);
  let connection;

  deps.loadEnv();
  const config = deps.loadConfig();

  try {
    connection = await deps.oracledb.getConnection(config.oracle);
    const oauthClient = deps.createOAuthClient({ http: deps.http, ...config.oauth });
    const sddsClient = deps.createSddsClient({
      http: deps.http,
      oauthClient,
      apiUrl: config.api.url,
      sleep: deps.sleep,
    });
    const resolver = deps.createReferenceResolver(connection);
    const repository = deps.createOracleRepository(connection, deps.oracledb);

    return await deps.runImport({ sddsClient, resolver, repository, logger: deps.logger });
  } finally {
    if (connection) await connection.close();
  }
}

if (require.main === module) {
  main()
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => {
      console.error(error?.message || 'Erreur inconnue');
      process.exitCode = 1;
    });
}

module.exports = { main };
