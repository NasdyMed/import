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
  const missingVariables = REQUIRED_VARIABLES.filter((name) => {
    const value = env[name];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missingVariables.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes: ${missingVariables.join(', ')}`,
    );
  }

  const importMode = env.IMPORT_MODE?.trim().toLowerCase();
  const effectiveImportMode = importMode || 'production';
  if (!['production', 'dev'].includes(effectiveImportMode)) {
    throw new Error("IMPORT_MODE doit être 'production' ou 'dev'");
  }

  return {
    ...(importMode ? { importMode: effectiveImportMode } : {}),
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
