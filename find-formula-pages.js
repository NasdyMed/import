const fs = require('node:fs/promises');
const path = require('node:path');
const axios = require('axios');
require('dotenv').config({ quiet: true });

const INPUT_FILE = path.resolve('flaCode.txt');
const OUTPUT_FILE = path.resolve('formula-pages.txt');
const PAGE_SIZE = 50;
const MAX_ATTEMPTS = 3;

if (process.env.ALLOW_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Variable manquante dans .env : ${name}`);
  return value;
}

async function getToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: requiredEnv('CLIENT_ID'),
    client_secret: requiredEnv('CLIENT_SECRET'),
    scope: requiredEnv('SCOPE'),
  });

  const response = await axios.post(requiredEnv('TOKEN_URL'), body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const token = response.data?.access_token;
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Le serveur OAuth n’a pas retourné de jeton');
  }
  return token;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getPage(page, tokenState) {
  let refreshed = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await axios.get(requiredEnv('API_URL'), {
        params: { page_size: PAGE_SIZE, page },
        headers: { Authorization: `Bearer ${tokenState.value}` },
      });
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 && !refreshed) {
        tokenState.value = await getToken();
        refreshed = true;
        attempt -= 1;
        continue;
      }
      const retryable = status === 429 || (status >= 500 && status <= 599);
      if (!retryable || attempt === MAX_ATTEMPTS) throw error;
      await sleep(attempt * 500);
    }
  }
  throw new Error(`Impossible de lire la page ${page}`);
}

async function loadFormulaCodes() {
  const content = await fs.readFile(INPUT_FILE, 'utf8');
  const codes = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((code) => code.toLowerCase() !== 'formula_code');
  return [...new Set(codes)];
}

async function main() {
  const codes = await loadFormulaCodes();
  const wanted = new Set(codes);
  const pagesByCode = new Map(codes.map((code) => [code, new Set()]));
  const tokenState = { value: await getToken() };

  const firstResponse = await getPage(1, tokenState);
  const pageCount = firstResponse.data?.page_count;
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('page_count invalide dans la réponse API');
  }

  for (let page = 1; page <= pageCount; page += 1) {
    const payload = page === 1 ? firstResponse.data : (await getPage(page, tokenState)).data;
    if (!Array.isArray(payload?.data)) throw new Error(`data invalide à la page ${page}`);

    for (const item of payload.data) {
      const code = typeof item?.r_i_formula_code === 'string'
        ? item.r_i_formula_code.trim()
        : '';
      if (wanted.has(code)) pagesByCode.get(code).add(page);
    }

    if (page === 1 || page % 100 === 0 || page === pageCount) {
      process.stdout.write(`Pages analysées : ${page}/${pageCount}\r`);
    }
  }

  const output = codes.map((code) => {
    const pages = [...pagesByCode.get(code)];
    return `${code}: ${pages.length ? pages.join(', ') : 'NOT_FOUND'}`;
  });
  await fs.writeFile(OUTPUT_FILE, `${output.join('\n')}\n`, 'utf8');

  const found = output.filter((line) => !line.endsWith('NOT_FOUND')).length;
  process.stdout.write('\n');
  console.log(`Terminé : ${found}/${codes.length} formules trouvées.`);
  console.log(`Résultat : ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(`Échec : ${error.message}`);
  process.exitCode = 1;
});
