# SDDS Production Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculer les indicateurs et la date de fabrication à partir du statut SDDS prioritaire, conserver les deux statuts en base et rejeter les données métier incohérentes.

**Architecture:** `src/mapper.js` reste l'unique source de vérité pour la sélection et la validation du statut ainsi que pour le calcul de `FAB_DATE`, `FIRST_FAB` et `LAST_FAB`. Les repositories Oracle et SQL ne font que sérialiser la ligne déjà calculée, tandis que l'importer journalise le contexte des rejets.

**Tech Stack:** Node.js 20, CommonJS, `node:test`, `node:assert/strict`, node-oracledb 6.x.

---

## Structure des fichiers

- Modifier `src/mapper.js` : sélectionner le statut effectif, valider la date obligatoire et produire les nouvelles propriétés de ligne.
- Modifier `test/mapper.test.js` : couvrir les règles métier, la priorité declared/SAP et tous les rejets.
- Modifier `src/oracle-repository.js` : ajouter les colonnes et binds Oracle des statuts.
- Modifier `test/oracle-repository.test.js` : vérifier l'ordre des colonnes et les nouveaux binds.
- Modifier `src/sql-file-repository.js` : sérialiser les deux statuts dans les scripts de développement.
- Créer `test/sql-file-repository.test.js` : vérifier le SQL généré et l'échappement des statuts.
- Modifier `src/importer.js` : ajouter les deux statuts au contexte du journal de rejet.
- Modifier `test/importer.test.js` : adapter les fixtures à la nouvelle règle et vérifier le journal.

### Task 1: Mapper le statut effectif et les colonnes de fabrication

**Files:**
- Modify: `test/mapper.test.js`
- Modify: `src/mapper.js`

- [ ] **Step 1: Remplacer les attentes historiques par les nouveaux cas nominaux**

Ajouter dans `test/mapper.test.js` des tests qui imposent les deux règles principales :

```js
test('maps in production from the declared status', () => {
  const result = mapEvent({
    plant_name: 'Paris Plant',
    r_i_formula_code: 'FORM-001',
    first_batch_date: '2025-01-15',
    last_batch_date: '2025-02-20',
    plant_declared_formula_status_text: '  in production  ',
    plant_sap_formula_status_text: 'end of production',
  }, references);

  assert.equal(result.ok, true);
  assert.deepEqual(result.row.fabDate, new Date(2025, 0, 15));
  assert.equal(result.row.firstFab, 'O');
  assert.equal(result.row.lastFab, 'N');
  assert.equal(result.row.firstFabDate, null);
  assert.equal(result.row.plantDeclaredStatus, '  in production  ');
  assert.equal(result.row.plantSapStatus, 'end of production');
});

test('maps end of production from SAP when declared status is blank', () => {
  const result = mapEvent({
    plant_name: 'Paris Plant',
    r_i_formula_code: 'FORM-001',
    first_batch_date: '2025-01-15',
    last_batch_date: '2025-02-20',
    plant_declared_formula_status_text: '   ',
    plant_sap_formula_status_text: 'end of production',
  }, references);

  assert.equal(result.ok, true);
  assert.deepEqual(result.row.fabDate, new Date(2025, 1, 20));
  assert.equal(result.row.firstFab, 'O');
  assert.equal(result.row.lastFab, 'O');
  assert.equal(result.row.firstFabDate, null);
});
```

- [ ] **Step 2: Ajouter les tests de rejet du statut et de la date obligatoire**

```js
test('rejects missing and unsupported production statuses', () => {
  assert.deepEqual(mapEvent({
    first_batch_date: '2025-01-15',
    last_batch_date: null,
    plant_declared_formula_status_text: null,
    plant_sap_formula_status_text: ' ',
  }, references), { ok: false, reason: 'missing_production_status' });

  assert.deepEqual(mapEvent({
    first_batch_date: '2025-01-15',
    last_batch_date: null,
    plant_declared_formula_status_text: 'Paused',
    plant_sap_formula_status_text: 'in production',
  }, references), { ok: false, reason: 'unsupported_production_status' });
});

test('rejects a recognized status without its required date', () => {
  assert.deepEqual(mapEvent({
    first_batch_date: null,
    last_batch_date: '2025-02-20',
    plant_declared_formula_status_text: 'in production',
  }, references), {
    ok: false,
    reason: 'missing_first_batch_date_for_in_production',
  });

  assert.deepEqual(mapEvent({
    first_batch_date: '2025-01-15',
    last_batch_date: null,
    plant_declared_formula_status_text: 'end of production',
  }, references), {
    ok: false,
    reason: 'missing_last_batch_date_for_end_production',
  });
});
```

Conserver les tests de dates invalides afin de garantir qu'une date non nulle mal formée reste rejetée, même si elle n'est pas la date choisie pour `FAB_DATE`.

- [ ] **Step 3: Exécuter uniquement les tests du mapper et constater l'échec**

Run: `node --test test/mapper.test.js`

Expected: FAIL sur les règles de statut et les propriétés `plantDeclaredStatus` / `plantSapStatus` non encore implémentées.

- [ ] **Step 4: Implémenter la sélection et le mapping dans `src/mapper.js`**

Ajouter les fonctions ciblées suivantes :

```js
function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function selectProductionStatus(event) {
  const declared = event.plant_declared_formula_status_text;
  const sap = event.plant_sap_formula_status_text;
  const selected = hasText(declared) ? declared : sap;
  return hasText(selected) ? selected.trim().toLowerCase() : null;
}
```

Après la validation actuelle des deux dates, remplacer l'ancien calcul par :

```js
const status = selectProductionStatus(event);
if (status === null) {
  return { ok: false, reason: 'missing_production_status' };
}

let fabDate;
let lastFab;
if (status === 'in production') {
  if (firstBatchDate.date === null) {
    return { ok: false, reason: 'missing_first_batch_date_for_in_production' };
  }
  fabDate = firstBatchDate.date;
  lastFab = 'N';
} else if (status === 'end of production') {
  if (lastBatchDate.date === null) {
    return { ok: false, reason: 'missing_last_batch_date_for_end_production' };
  }
  fabDate = lastBatchDate.date;
  lastFab = 'O';
} else {
  return { ok: false, reason: 'unsupported_production_status' };
}
```

Dans la ligne produite, utiliser exactement :

```js
fabDate,
firstFab: 'O',
lastFab,
plantSapStatus: event.plant_sap_formula_status_text ?? null,
plantDeclaredStatus: event.plant_declared_formula_status_text ?? null,
firstFabDate: null,
```

- [ ] **Step 5: Exécuter les tests du mapper**

Run: `node --test test/mapper.test.js`

Expected: tous les tests passent.

- [ ] **Step 6: Committer le mapper**

```bash
git add src/mapper.js test/mapper.test.js
git commit -m "feat: map SDDS production statuses"
```

### Task 2: Étendre l'INSERT Oracle

**Files:**
- Modify: `test/oracle-repository.test.js`
- Modify: `src/oracle-repository.js`

- [ ] **Step 1: Étendre le test du repository Oracle**

Ajouter à la ligne de test :

```js
plantSapStatus: 'end of production',
plantDeclaredStatus: 'in production',
firstFabDate: null,
```

Étendre la liste attendue des colonnes, après `FIRST_FAB_DATE`, avec :

```js
'PLANT_SAP_STATUS', 'PLANT_DECLARED_STATUS',
```

Vérifier également les binds :

```js
plantSapStatus: { type: 'STRING', maxSize: 255 },
plantDeclaredStatus: { type: 'STRING', maxSize: 255 },
```

et remplacer l'expression portant sur la fin des valeurs par :

```js
assert.match(
  sql,
  /:frmCd\s*,\s*SYSDATE\s*,\s*:firstFabDate\s*,\s*:plantSapStatus\s*,\s*:plantDeclaredStatus/i,
);
```

- [ ] **Step 2: Exécuter le test Oracle et constater l'échec**

Run: `node --test test/oracle-repository.test.js`

Expected: FAIL car les colonnes et les binds n'existent pas encore.

- [ ] **Step 3: Ajouter les colonnes et binds dans `src/oracle-repository.js`**

Terminer les listes SQL par :

```sql
FRM_CD, TIMESTAMP, FIRST_FAB_DATE, PLANT_SAP_STATUS, PLANT_DECLARED_STATUS
```

et :

```sql
:frmCd, SYSDATE, :firstFabDate, :plantSapStatus, :plantDeclaredStatus
```

Ajouter aux `bindDefs` :

```js
plantSapStatus: string(255),
plantDeclaredStatus: string(255),
```

- [ ] **Step 4: Exécuter les tests Oracle**

Run: `node --test test/oracle-repository.test.js`

Expected: tous les tests passent.

- [ ] **Step 5: Committer le repository Oracle**

```bash
git add src/oracle-repository.js test/oracle-repository.test.js
git commit -m "feat: persist SDDS production statuses"
```

### Task 3: Étendre la génération des fichiers SQL

**Files:**
- Create: `test/sql-file-repository.test.js`
- Modify: `src/sql-file-repository.js`

- [ ] **Step 1: Écrire le test de sérialisation SQL**

Créer `test/sql-file-repository.test.js` :

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { rowToInsert } = require('../src/sql-file-repository');

test('rowToInsert includes both SDDS production statuses', () => {
  const sql = rowToInsert({
    frmId: 42,
    facCode: 'FAC-1',
    facLabel: 'Factory',
    frmLabel: '-',
    fabDate: new Date(2025, 0, 15),
    firstFab: 'O',
    lastFab: 'N',
    source: 'SDDS',
    frmCd: 'FORM-1',
    firstFabDate: null,
    plantSapStatus: 'end of production',
    plantDeclaredStatus: "Director's in production",
  });

  assert.match(sql, /FIRST_FAB_DATE, PLANT_SAP_STATUS, PLANT_DECLARED_STATUS/);
  assert.match(sql, /NULL, 'end of production', 'Director''s in production'\);$/);
});
```

- [ ] **Step 2: Exécuter le test et constater l'échec**

Run: `node --test test/sql-file-repository.test.js`

Expected: FAIL car les nouvelles colonnes sont absentes du SQL.

- [ ] **Step 3: Étendre `COLUMNS` dans `src/sql-file-repository.js`**

Ajouter après `FIRST_FAB_DATE` :

```js
['PLANT_SAP_STATUS', 'plantSapStatus'],
['PLANT_DECLARED_STATUS', 'plantDeclaredStatus'],
```

- [ ] **Step 4: Exécuter le test SQL**

Run: `node --test test/sql-file-repository.test.js`

Expected: PASS, y compris pour l'apostrophe échappée.

- [ ] **Step 5: Committer la génération SQL**

```bash
git add src/sql-file-repository.js test/sql-file-repository.test.js
git commit -m "feat: export SDDS statuses in SQL files"
```

### Task 4: Enrichir le journal des rejets

**Files:**
- Modify: `test/importer.test.js`
- Modify: `src/importer.js`

- [ ] **Step 1: Adapter la fixture valide aux nouvelles exigences**

Dans la fonction `event`, remplacer les dates nulles et ajouter un statut nominal :

```js
first_batch_date: '2025-01-15',
last_batch_date: null,
plant_declared_formula_status_text: 'in production',
plant_sap_formula_status_text: 'in production',
```

- [ ] **Step 2: Ajouter un rejet métier et vérifier son contexte journalisé**

Dans le test des rejets, ajouter un événement avec :

```js
event({
  r_i_formula_code: 'BAD-STATUS',
  plant_declared_formula_status_text: 'Paused',
  plant_sap_formula_status_text: 'end of production',
})
```

Lui associer des références résolues et vérifier que l'entrée du journal contient :

```js
{
  event: 'rejected_item',
  page: 7,
  r_i_formula_code: 'BAD-STATUS',
  plant_code: 'PLANT-001',
  plant_declared_formula_status_text: 'Paused',
  plant_sap_formula_status_text: 'end of production',
  reason: 'unsupported_production_status',
}
```

Adapter les compteurs `received`, `inserted` et `rejected` au nombre final de fixtures.

- [ ] **Step 3: Exécuter le test de l'importer et constater l'échec**

Run: `node --test test/importer.test.js`

Expected: FAIL car le journal ne contient pas encore les deux statuts.

- [ ] **Step 4: Ajouter les valeurs de statut au journal dans `src/importer.js`**

Étendre la charge utile `rejected_item` avec :

```js
plant_declared_formula_status_text: event.plant_declared_formula_status_text ?? null,
plant_sap_formula_status_text: event.plant_sap_formula_status_text ?? null,
```

- [ ] **Step 5: Exécuter les tests de l'importer**

Run: `node --test test/importer.test.js`

Expected: tous les tests passent et les rejets continuent sans arrêter la page.

- [ ] **Step 6: Committer le journal enrichi**

```bash
git add src/importer.js test/importer.test.js
git commit -m "feat: log rejected SDDS production statuses"
```

### Task 5: Vérification finale

**Files:**
- Verify: `src/mapper.js`
- Verify: `src/oracle-repository.js`
- Verify: `src/sql-file-repository.js`
- Verify: `src/importer.js`
- Verify: `test/*.test.js`

- [ ] **Step 1: Exécuter toute la suite de tests**

Run: `npm test`

Expected: tous les tests passent, sans accès à l'API SDDS ni à Oracle.

- [ ] **Step 2: Vérifier les modifications de travail**

Run: `git diff --check`

Expected: aucune erreur d'espace ou de fin de ligne.

- [ ] **Step 3: Vérifier que seuls les fichiers prévus sont engagés**

Run: `git status --short`

Expected: aucun fichier de l'implémentation ne reste non suivi ou modifié. Les fichiers préexistants non liés, notamment `docs/CONFLUENCE_MIGRATION_API_SDDS_ORACLE.md` et `scripts/`, restent intacts.

- [ ] **Step 4: Examiner l'historique de la fonctionnalité**

Run: `git log --oneline -5`

Expected: les commits du mapper, du repository Oracle, de la génération SQL et du journal sont présents après les commits de spécification et de planification.
