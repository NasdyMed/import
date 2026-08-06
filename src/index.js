function resolveDependencies(dependencies = {}, requireFn = require) {
  return {
    loadEnv: dependencies.loadEnv ?? (() => requireFn('dotenv').config({ quiet: true })),
    loadConfig: dependencies.loadConfig ?? requireFn('./config').loadConfig,
    http: dependencies.http ?? requireFn('axios'),
    oracledb: dependencies.oracledb ?? requireFn('oracledb'),
    createOAuthClient:
      dependencies.createOAuthClient ?? requireFn('./oauth-client').createOAuthClient,
    createSddsClient: dependencies.createSddsClient ?? requireFn('./sdds-client').createSddsClient,
    createReferenceResolver:
      dependencies.createReferenceResolver ??
      requireFn('./reference-resolver').createReferenceResolver,
    createOracleRepository:
      dependencies.createOracleRepository ??
      requireFn('./oracle-repository').createOracleRepository,
    runImport: dependencies.runImport ?? requireFn('./importer').runImport,
    logger: dependencies.logger ?? console,
    sleep:
      dependencies.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  };
}

async function main(dependencies = {}) {
  const deps = resolveDependencies(dependencies);
  let connection;
  let primaryError;

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
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        if (!primaryError) throw closeError;

        try {
          const target = Object(primaryError);
          const property = !('closeError' in target)
            ? 'closeError'
            : !('cause' in target)
              ? 'cause'
              : null;
          if (property) {
            Object.defineProperty(primaryError, property, {
              value: closeError,
              configurable: true,
            });
          }
        } catch {
          // A non-extensible primary error must still remain the observed failure.
        }
      }
    }
  }
}

async function runCli(mainFn = main, output = console, processRef = process) {
  try {
    const summary = await mainFn();
    output.log(JSON.stringify(summary));
  } catch {
    output.error('Échec de l’import SDDS vers Oracle');
    processRef.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = { main, resolveDependencies, runCli };
