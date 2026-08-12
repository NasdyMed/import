# Development SQL Export Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un mode DEV qui génère des fichiers SQL Oracle par groupes de 20 pages sans exécuter d’écriture Oracle.

**Architecture:** Le mapper reste commun aux deux modes. Un dépôt SQL implémente la même interface opérationnelle que le dépôt Oracle, tandis que le point d’entrée sélectionne explicitement le dépôt selon `IMPORT_MODE`; le résolveur Oracle demeure actif dans les deux modes.

**Tech Stack:** Node.js CommonJS, `node:fs/promises`, Oracle SQL.

---

### Task 1: Configuration et mapping commun

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `src/config.js`
- Modify: `src/mapper.js`

- [ ] Ajouter `IMPORT_MODE=production` et ignorer `sql/`.
- [ ] Valider `IMPORT_MODE` après chargement : uniquement `production` ou `dev`, avec `production` par défaut si la variable est absente.
- [ ] Retourner le mode dans la configuration structurée.
- [ ] Remplacer `frmLabel: null` par `frmLabel: '-'` dans le mapping partagé.
- [ ] Exécuter `node --check src/config.js` et `node --check src/mapper.js`; résultat attendu : codes de sortie 0.

### Task 2: Dépôt d’export SQL

**Files:**
- Create: `src/sql-file-repository.js`

- [ ] Définir la liste exacte des 25 colonnes dans l’ordre du dépôt Oracle.
- [ ] Implémenter la sérialisation : `NULL`, chaînes avec apostrophes doublées, dates locales en `TO_DATE('YYYY-MM-DD', 'YYYY-MM-DD')`, nombres non quotés, `SYSDATE` pour `TIMESTAMP`.
- [ ] Exposer `createSqlFileRepository({ outputDir, pagesPerFile, mkdir, writeFile, logger })` avec `insertRows(rows)`, `completePage(pageNumber)`, `commit()`, `rollback()` et `close()`.
- [ ] Accumuler les lignes et écrire à chaque vingtième page un fichier `import-pages-NNNN-NNNN.sql`; écrire le reliquat à `close()`.
- [ ] Terminer chaque fichier par `COMMIT;` puis `/` et émettre `sql_file_generated`.
- [ ] Exécuter `node --check src/sql-file-repository.js`; résultat attendu : code 0.

### Task 3: Orchestration par mode

**Files:**
- Modify: `src/importer.js`
- Modify: `src/index.js`

- [ ] Après chaque page, appeler `repository.completePage(pageNumber)` lorsqu’elle existe.
- [ ] En mode DEV, ne pas appeler les commits périodiques Oracle; laisser le dépôt SQL écrire ses frontières de fichier.
- [ ] Garder `inserted=0` et incrémenter `generated` en mode DEV; conserver le résumé production existant avec `generated=0`.
- [ ] Dans `main`, construire le dépôt Oracle seulement pour `production` et le dépôt SQL seulement pour `dev`.
- [ ] Garantir que le mode DEV n’appelle jamais `connection.executeMany`, `connection.commit` ou `connection.rollback`.
- [ ] Exécuter `node --check src/importer.js` et `node --check src/index.js`; résultat attendu : codes 0.

### Task 4: Documentation et vérification manuelle

**Files:**
- Modify: `README.md`
- Create temporarily then remove: `scripts/verify-dev-export.js`

- [ ] Documenter `IMPORT_MODE`, les fichiers de 20 pages, `FRM_LABEL='-'`, le `COMMIT; /` final et l’absence d’écriture Oracle en DEV.
- [ ] Créer un script temporaire avec un dépôt SQL et 21 pages simulées, sans HTTP ni Oracle, afin de produire deux fichiers.
- [ ] Vérifier que le premier fichier couvre 1–20, le second 21–21, que les apostrophes et dates sont correctes et que chaque fichier se termine par `COMMIT;\n/`.
- [ ] Supprimer le script temporaire et les fichiers SQL simulés.
- [ ] Exécuter `node --check` sur tous les fichiers `src/*.js`, `git diff --check` et vérifier que `sql/` est ignoré.
- [ ] Vérifier qu’aucun secret ni fichier `.sql` généré n’est suivi par Git.
- [ ] Committer avec `feat: add development SQL export mode`.
