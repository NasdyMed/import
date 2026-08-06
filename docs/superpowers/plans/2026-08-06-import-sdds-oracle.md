# SDDS Oracle Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un programme Node.js testé qui charge les pages SDDS authentifiées par OAuth et insère dans Oracle uniquement les événements dont les références formule et usine sont résolues.

**Architecture:** Le programme utilise des modules CommonJS ciblés et injecte ses dépendances HTTP et Oracle pour rester testable. L’orchestrateur traite les pages en flux, fait résoudre les références par lots avec caches progressifs, mappe les lignes, puis appelle `executeMany` et commit toutes les 20 pages.

**Tech Stack:** Node.js 20+, JavaScript CommonJS, `oracledb`, `axios`, `dotenv`, test runner natif `node:test`.

---

## Structure des fichiers

- `package.json` : scripts et dépendances.
- `.gitignore` : exclusion des secrets et artefacts.
- `.env.example` : liste non sensible des variables.
- `src/config.js` : lecture et validation de l’environnement.
- `src/oauth-client.js` : acquisition du jeton OAuth.
- `src/sdds-client.js` : requêtes paginées, retry et renouvellement du jeton.
- `src/mapper.js` : conversion pure SDDS vers les binds Oracle.
- `src/reference-resolver.js` : lookups Oracle groupés et caches.
- `src/oracle-repository.js` : connexion, insertion, commit et rollback.
- `src/importer.js` : orchestration du traitement en flux.
- `src/index.js` : point d’entrée et bilan final.
- `test/*.test.js` : tests unitaires par responsabilité.

### Task 1: Initialiser le projet et valider la configuration

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `test/config.test.js`
- Create: `src/config.js`

- [ ] **Step 1: Créer le manifeste, `.gitignore` et `.env.example`**

Déclarer Node 20+, `npm test` comme `node --test`, et les dépendances `axios`, `dotenv`, `oracledb`. Ignorer `.env`, `node_modules/`, `*.log` et `coverage/`. L’exemple d’environnement liste les neuf variables de la spécification avec des valeurs vides.

- [ ] **Step 2: Écrire les tests en échec**

Tester que `loadConfig(env)` renvoie une configuration structurée quand les neuf valeurs sont présentes et qu’il lève `Variables d'environnement manquantes: SCOPE, ORACLE_PASSWORD` avec une liste déterministe lorsqu’elles manquent.

- [ ] **Step 3: Vérifier RED**

Run: `npm test -- test/config.test.js`
Expected: FAIL avec `Cannot find module '../src/config'`.

- [ ] **Step 4: Implémenter le minimum**

Exporter `loadConfig(env = process.env)`. Valider `TOKEN_URL`, `API_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `SCOPE`, `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`, puis retourner `{ oauth: {...}, api: {...}, oracle: {...} }`.

- [ ] **Step 5: Vérifier GREEN et committer**

Run: `npm test -- test/config.test.js`
Expected: 2 tests PASS.

```powershell
git add package.json .gitignore .env.example src/config.js test/config.test.js
git commit -m "feat: validate import configuration"
```

### Task 2: Mapper et valider les lignes SDDS

**Files:**
- Create: `test/mapper.test.js`
- Create: `src/mapper.js`

- [ ] **Step 1: Écrire les tests en échec**

Créer quatre tests de `mapEvent(event, references)` : dates toutes deux présentes, repli sur `first_batch_date`, indicateurs `N` pour dates nulles, et rejet `{ ok: false, reason: 'Invalid last_batch_date' }` pour une date invalide. Vérifier aussi `source === 'SDDS'`, `frmCd`, `facLabel` et tous les champs explicitement nuls.

- [ ] **Step 2: Vérifier RED**

Run: `npm test -- test/mapper.test.js`
Expected: FAIL avec module absent.

- [ ] **Step 3: Implémenter le minimum**

Exporter `mapEvent`. Convertir strictement les chaînes `YYYY-MM-DD` en dates UTC et vérifier que la date reconstruite conserve année, mois et jour. Produire les noms de binds correspondant à toutes les colonnes sauf `TIMESTAMP`, injecté comme `SYSDATE` dans le SQL.

- [ ] **Step 4: Vérifier GREEN et committer**

Run: `npm test -- test/mapper.test.js`
Expected: 4 tests PASS.

```powershell
git add src/mapper.js test/mapper.test.js
git commit -m "feat: map SDDS production events"
```

### Task 3: Obtenir et renouveler le jeton OAuth

**Files:**
- Create: `test/oauth-client.test.js`
- Create: `src/oauth-client.js`

- [ ] **Step 1: Écrire les tests en échec**

Injecter un faux client HTTP. Vérifier que `getToken()` envoie un formulaire URL-encodé contenant exactement `grant_type`, `client_id`, `client_secret`, `scope`, avec `Content-Type: application/x-www-form-urlencoded`, puis retourne `access_token`. Vérifier qu’une réponse sans jeton lève `OAuth response does not contain access_token`.

- [ ] **Step 2: Vérifier RED**

Run: `npm test -- test/oauth-client.test.js`
Expected: FAIL avec module absent.

- [ ] **Step 3: Implémenter le minimum**

Exporter `createOAuthClient({ http, tokenUrl, clientId, clientSecret, scope })`, qui expose `getToken()` et ne journalise jamais les paramètres sensibles.

- [ ] **Step 4: Vérifier GREEN et committer**

Run: `npm test -- test/oauth-client.test.js`
Expected: 2 tests PASS.

```powershell
git add src/oauth-client.js test/oauth-client.test.js
git commit -m "feat: authenticate with OAuth client credentials"
```

### Task 4: Parcourir les pages SDDS avec retry

**Files:**
- Create: `test/sdds-client.test.js`
- Create: `src/sdds-client.js`

- [ ] **Step 1: Écrire les tests en échec**

Tester `pages()` avec des réponses dont `page_count` vaut 3 et vérifier les paramètres `{ page_size: 50, page: 1..3 }`. Tester un `401` suivi d’un succès et vérifier un seul renouvellement. Tester deux `500` suivis d’un succès avec une fonction `sleep` injectée. Tester le rejet d’un `data` non-tableau et d’un `page_count` invalide.

- [ ] **Step 2: Vérifier RED**

Run: `npm test -- test/sdds-client.test.js`
Expected: FAIL avec module absent.

- [ ] **Step 3: Implémenter le minimum**

Exporter `createSddsClient({ http, oauthClient, apiUrl, sleep, maxAttempts = 3 })`. Implémenter un générateur asynchrone `pages()`; envoyer `Authorization: Bearer <token>`; renouveler une fois sur `401`; retenter `429`/`5xx` avec 250 ms puis 500 ms; propager les autres erreurs.

- [ ] **Step 4: Vérifier GREEN et committer**

Run: `npm test -- test/sdds-client.test.js`
Expected: 5 tests PASS.

```powershell
git add src/sdds-client.js test/sdds-client.test.js
git commit -m "feat: stream paginated SDDS responses"
```

### Task 5: Résoudre les références Oracle par lots

**Files:**
- Create: `test/reference-resolver.test.js`
- Create: `src/reference-resolver.js`

- [ ] **Step 1: Écrire les tests en échec**

Avec une connexion injectée, vérifier que `resolvePage(events)` déduplique les codes, interroge uniquement les codes absents des caches, peuple les résultats, et ne répète aucune requête à la seconde page. Vérifier qu’un code absent est mémorisé comme introuvable afin de ne pas être recherché à chaque page.

- [ ] **Step 2: Vérifier RED**

Run: `npm test -- test/reference-resolver.test.js`
Expected: FAIL avec module absent.

- [ ] **Step 3: Implémenter le minimum**

Exporter `createReferenceResolver(connection)`. Construire les clauses `IN (:v0, :v1, ...)` uniquement à partir d’identifiants générés, les valeurs restant dans les binds. Exécuter les deux lookups, stocker les résultats ou `null` dans des `Map`, et retourner pour chaque événement `{ frmId, facCode }`.

- [ ] **Step 4: Vérifier GREEN et committer**

Run: `npm test -- test/reference-resolver.test.js`
Expected: 3 tests PASS.

```powershell
git add src/reference-resolver.js test/reference-resolver.test.js
git commit -m "feat: resolve Oracle references with caches"
```

### Task 6: Insérer les lots Oracle

**Files:**
- Create: `test/oracle-repository.test.js`
- Create: `src/oracle-repository.js`

- [ ] **Step 1: Écrire les tests en échec**

Vérifier que `insertRows(rows)` ne fait rien pour un tableau vide et appelle `executeMany` avec le SQL ciblant les 25 colonnes, `SYSDATE` pour `TIMESTAMP`, `autoCommit: false`, `bindDefs` explicites et `batchErrors: false`. Vérifier que `commit`, `rollback` et `close` délèguent à la connexion.

- [ ] **Step 2: Vérifier RED**

Run: `npm test -- test/oracle-repository.test.js`
Expected: FAIL avec module absent.

- [ ] **Step 3: Implémenter le minimum**

Exporter `createOracleRepository(connection, oracledb)`. Définir des tailles maximales raisonnables pour les chaînes et lier les dates avec `oracledb.DATE`. Garder le nom de colonne réservé `TIMESTAMP` tel qu’il existe dans le schéma.

- [ ] **Step 4: Vérifier GREEN et committer**

Run: `npm test -- test/oracle-repository.test.js`
Expected: 4 tests PASS.

```powershell
git add src/oracle-repository.js test/oracle-repository.test.js
git commit -m "feat: bulk insert production events"
```

### Task 7: Orchestrer l’import, les rejets et les transactions

**Files:**
- Create: `test/importer.test.js`
- Create: `src/importer.js`

- [ ] **Step 1: Écrire les tests en échec**

Tester avec 21 pages que l’importeur commit après la page 20 puis à la fin. Inclure des références absentes et une date invalide; vérifier les logs de rejet et le bilan `{ pages: 21, received, inserted, rejected }`. Faire lever `insertRows`; vérifier rollback, absence de commit final et propagation de l’erreur.

- [ ] **Step 2: Vérifier RED**

Run: `npm test -- test/importer.test.js`
Expected: FAIL avec module absent.

- [ ] **Step 3: Implémenter le minimum**

Exporter `runImport({ sddsClient, resolver, repository, logger, commitEveryPages = 20 })`. Pour chaque événement, rejeter les champs de lookup vides, références nulles et mappings invalides. Émettre un objet de log sans secret. Insérer une fois par page, committer au seuil et à la fin, rollback sur toute exception Oracle ou HTTP.

- [ ] **Step 4: Vérifier GREEN et committer**

Run: `npm test -- test/importer.test.js`
Expected: 3 tests PASS.

```powershell
git add src/importer.js test/importer.test.js
git commit -m "feat: orchestrate transactional SDDS import"
```

### Task 8: Câbler le point d’entrée

**Files:**
- Create: `test/index.test.js`
- Create: `src/index.js`
- Create: `README.md`

- [ ] **Step 1: Écrire le test en échec**

Tester `main(dependencies)` avec des fabriques injectées : ouverture de la connexion, exécution de l’import, fermeture dans `finally`, code de retour 0 en succès et erreur propagée après fermeture.

- [ ] **Step 2: Vérifier RED**

Run: `npm test -- test/index.test.js`
Expected: FAIL avec module absent.

- [ ] **Step 3: Implémenter le minimum**

Charger `dotenv/config`, construire Axios et `oracledb`, ouvrir la connexion avec la configuration, câbler les composants et afficher uniquement le bilan. Sous `if (require.main === module)`, fixer `process.exitCode = 1` et afficher un message assaini en cas d’échec. Documenter installation, configuration, lancement, comportement des commits et procédure de relance.

- [ ] **Step 4: Vérifier GREEN et committer**

Run: `npm test -- test/index.test.js`
Expected: 2 tests PASS.

```powershell
git add src/index.js test/index.test.js README.md
git commit -m "feat: add executable SDDS Oracle importer"
```

### Task 9: Vérification finale

**Files:**
- Modify only if a verification exposes a defect.

- [ ] **Step 1: Installer proprement les dépendances**

Run: `npm install`
Expected: création de `package-lock.json` sans erreur.

- [ ] **Step 2: Exécuter toute la suite**

Run: `npm test`
Expected: tous les tests PASS, aucune fuite de secret dans la sortie.

- [ ] **Step 3: Vérifier les secrets et la syntaxe**

Run: `git grep -n -E 'NASDYMADM|CLIENT_SECRET=.+|ORACLE_PASSWORD=.+' -- ':!docs/superpowers/**'`
Expected: aucune sortie.

Run: `node --check src/index.js`
Expected: code de sortie 0.

- [ ] **Step 4: Vérifier l’état Git et committer le lockfile**

Run: `git status --short`
Expected: seulement `package-lock.json`, sauf correction explicitement effectuée.

```powershell
git add package-lock.json
git commit -m "build: lock importer dependencies"
```

