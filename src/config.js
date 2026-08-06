const REQUIRED_VARIABLES = [
  'TOKEN_URL',
  'API_URL',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'SCOPE',
  'ORACLE_USER',
  'ORACLE_PASSWORD',
  'ORACLE_CONNECT_STRING',
];

function loadConfig(env = process.env) {
  const missingVariables = REQUIRED_VARIABLES.filter((name) => !env[name]);

  if (missingVariables.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes: ${missingVariables.join(', ')}`,
    );
  }

  return {
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
  };
}

module.exports = { loadConfig };
