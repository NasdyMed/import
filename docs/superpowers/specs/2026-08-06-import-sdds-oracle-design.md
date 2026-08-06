# Import SDDS vers Oracle — Spécification de conception

## Objectif

Créer un programme Node.js qui obtient un jeton OAuth 2.0 avec le flux `client_credentials`, parcourt toutes les pages de l’API SDDS et insère les événements de production valides dans `fl_formula_import.dgo_production_event_v2`.

La table cible est vide avant ce chargement initial. Le programme ne supprime ni ne met à jour de données existantes.

## Entrées et configuration

La configuration est fournie exclusivement par variables d’environnement :

- `TOKEN_URL`
- `API_URL`
- `CLIENT_ID`
- `CLIENT_SECRET`
- `SCOPE`
- `ORACLE_USER`
- `ORACLE_PASSWORD`
- `ORACLE_CONNECT_STRING`

Le dépôt contient un `.env.example` sans secret. Le fichier `.env` est ignoré par Git. Le secret Oracle communiqué pendant la conception ne doit apparaître dans aucun fichier du projet.

## Architecture

Le programme est divisé en unités indépendantes :

1. Un chargeur de configuration valide les variables obligatoires au démarrage.
2. Un client OAuth obtient un jeton avec une requête `POST` contenant `grant_type=client_credentials`, `client_id`, `client_secret` et `scope`.
3. Un client SDDS appelle `API_URL?page_size=50&page=N`. La première réponse fournit `page_count`; le client traite ensuite les pages `1` à `page_count` incluses.
4. Un résolveur Oracle maintient deux caches progressifs et recherche en groupe les valeurs absentes du cache pour chaque page :
   - `r_i_formula_code` vers `FRM_ID`, à partir de `FL_FORMULA.FL_FORMULA` et `FRM_CD`;
   - `plant_code` vers `FAC_CODE`, à partir de `fl_formula_import.dgo_factory` et `SAP_FAC_CODE`.
5. Un mapper pur transforme un objet SDDS et ses références résolues en ligne cible.
6. Un importeur insère les lignes valides par lots avec `oracledb.executeMany` et des variables liées.

Les pages sont traitées en flux et ne sont pas toutes conservées en mémoire.

## Pagination et authentification

La taille de page est fixée à 50. Le nombre total de pages vient de `page_count` dans la première réponse. Une réponse doit contenir un tableau `data` et un `page_count` entier positif.

Les erreurs HTTP temporaires `429` et `5xx` sont retentées avec un nombre maximal de tentatives et un délai progressif borné. Sur `401`, le client renouvelle une fois le jeton puis rejoue la requête. Une erreur HTTP persistante arrête l’import.

## Mapping Oracle

| Colonne Oracle | Valeur |
|---|---|
| `FRM_ID` | `FRM_ID` trouvé par `r_i_formula_code` |
| `FAC_CODE` | `FAC_CODE` trouvé par `plant_code` |
| `FAC_LABEL` | `plant_name` |
| `FRM_LABEL` | `NULL` |
| `FAB_DATE` | `last_batch_date`, sinon `first_batch_date` |
| `BATCH_CODE` | `NULL` |
| `FIRST_FAB` | `'O'` si `first_batch_date` est non nul, sinon `'N'` |
| `LAST_FAB` | `'O'` si `last_batch_date` est non nul, sinon `'N'` |
| `DEROGATION` | `NULL` |
| `START_DEROGATION` | `NULL` |
| `END_DEROGATION` | `NULL` |
| `COMMENT_DEROGATION` | `NULL` |
| `SUBCONTRACTED` | `NULL` |
| `FULLBUY` | `NULL` |
| `PRODUCER_CODE` | `NULL` |
| `PRODUCER_LABEL` | `NULL` |
| `PRODUCER_COUNTRY` | `NULL` |
| `UPDATE_DATE` | `NULL` |
| `SOURCE` | `'SDDS'` |
| `ID_SATURNE` | `NULL` |
| `FLAG_DELETE_SATURNE` | `NULL` |
| `CODE_BATCH_PF` | `NULL` |
| `FRM_CD` | `r_i_formula_code` |
| `TIMESTAMP` | `SYSDATE` calculé par Oracle |
| `FIRST_FAB_DATE` | `first_batch_date` |

Les dates ISO `YYYY-MM-DD` sont converties en objets `Date` JavaScript avant liaison Oracle. Une date non nulle mais invalide provoque le rejet journalisé de la ligne, sans arrêter les autres lignes.

## Rejets et journalisation

Une ligne est rejetée et le traitement continue lorsque :

- sa formule n’existe pas dans `FL_FORMULA.FL_FORMULA`;
- son usine n’existe pas dans `fl_formula_import.dgo_factory`;
- une date fournie n’est pas valide;
- un champ indispensable au lookup est vide.

Chaque rejet indique au minimum la page, `r_i_formula_code`, `plant_code` et le motif. Le bilan final indique le nombre de pages lues, de lignes reçues, insérées et rejetées.

Les secrets, le jeton OAuth et le mot de passe Oracle ne sont jamais journalisés.

## Transactions et reprise

Les insertions sont validées toutes les 20 pages, soit au maximum 1 000 objets API avant filtrage. En cas d’erreur Oracle, le lot courant est annulé et le programme s’arrête avec un code de sortie non nul. Les lots déjà validés restent présents.

Comme ce chargement initial est un insert simple, une relance après échec nécessite de vider préalablement les lignes déjà insérées ou de reprendre manuellement à la première page non validée. L’ajout d’un mécanisme automatique d’upsert ou de checkpoint est hors périmètre de cette première version.

## Tests

Les tests automatisés couvrent :

- la validation de la configuration;
- le mapping des dates et des indicateurs `FIRST_FAB`/`LAST_FAB`;
- la valeur de repli de `FAB_DATE`;
- le rejet d’une date invalide;
- la pagination de `1` à `page_count`;
- le renouvellement du jeton après un `401`;
- la poursuite après une référence formule ou usine absente;
- la constitution des lots et les commits toutes les 20 pages;
- le rollback et l’arrêt sur erreur Oracle.

Les dépendances HTTP et Oracle sont injectées dans les composants afin que les tests n’aient besoin ni du réseau ni d’une base réelle.

## Hors périmètre

- Mise à jour ou déduplication de lignes existantes.
- Création ou modification de tables Oracle.
- Stockage de secrets dans le projet.
- Exécution planifiée par un ordonnanceur.
- Interface graphique.
