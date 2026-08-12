# Import SDDS vers Oracle

Ce programme importe les événements de production fournis par SDDS dans Oracle.

## Prérequis

- Node.js 20 ou une version ultérieure ;
- un accès réseau aux services OAuth, SDDS et Oracle ;
- selon l'installation Oracle, les bibliothèques clientes Oracle (Oracle Instant Client) accessibles au système. Le pilote `oracledb` peut aussi fonctionner en mode Thin sans client natif lorsque la configuration Oracle le permet.

## Installation et configuration

Installez les dépendances puis créez votre fichier de configuration local :

```powershell
npm install
Copy-Item .env.example .env
```

Renseignez les variables de `.env` :

- `TOKEN_URL` : URL du serveur OAuth ;
- `API_URL` : URL de l'API SDDS ;
- `CLIENT_ID` : identifiant du client OAuth ;
- `CLIENT_SECRET` : secret du client OAuth ;
- `SCOPE` : périmètre OAuth demandé ;
- `ORACLE_USER` : utilisateur Oracle ;
- `ORACLE_PASSWORD` : mot de passe Oracle ;
- `ORACLE_CONNECT_STRING` : chaîne de connexion Oracle ;
- `ALLOW_INSECURE_TLS` : `true` pour désactiver explicitement la validation TLS, sinon `false`.
- `IMPORT_MODE` : `production` pour insérer dans Oracle, ou `dev` pour générer uniquement des fichiers SQL.

Ne versionnez jamais `.env`, les mots de passe, les jetons ou tout autre secret.

## Exécution

```powershell
node src/index.js
```

Avec `ALLOW_INSECURE_TLS=true`, le programme positionne `NODE_TLS_REJECT_UNAUTHORIZED=0` avant les appels OAuth et API. Cette option désactive globalement la validation des certificats HTTPS et ne doit être utilisée que sur un réseau maîtrisé. La solution recommandée reste l'installation du certificat d'entreprise avec `NODE_EXTRA_CA_CERTS`.

L'import parcourt l'API par pages de 50 éléments. Les événements dont les références formule ou usine sont absentes ou introuvables sont ignorés et journalisés. Les lignes valides sont insérées par lots avec `executeMany`, et une validation Oracle (`commit`) est effectuée toutes les 20 pages ainsi qu'à la fin.

Chaque exécution crée `logs/import-<date>.jsonl`. Ce fichier contient les rejets, les pages traitées, les commits et l'erreur technique finale avec la dernière page atteinte. Les jetons et secrets connus sont masqués. Les mêmes événements restent visibles dans la console, suivis du résumé final.

## Mode DEV : export SQL sans insertion

Pour vérifier l’import sans écrire dans la table cible :

```env
IMPORT_MODE=dev
```

Ce mode conserve l’authentification, la pagination et les requêtes Oracle `SELECT` qui résolvent `FRM_ID` et `FAC_CODE`. Les formules et usines absentes restent rejetées. En revanche, aucun `INSERT`, `COMMIT` ou `ROLLBACK` n’est exécuté sur Oracle.

Les lignes valides sont écrites dans des fichiers de 20 pages :

```text
sql/import-pages-0001-0020.sql
sql/import-pages-0021-0040.sql
```

Le dernier fichier peut contenir moins de 20 pages. Chaque fichier est autonome et se termine par :

```sql
COMMIT;
/
```

Les apostrophes sont échappées, les dates utilisent `TO_DATE`, les valeurs absentes utilisent `NULL` et `TIMESTAMP` utilise `SYSDATE`. `FRM_LABEL` vaut `'-'` dans les modes DEV et production. Le résumé DEV conserve `inserted: 0` et indique le nombre de requêtes produites dans `generated`.

Pour revenir à l’insertion réelle :

```env
IMPORT_MODE=production
```

En cas de redémarrage après une erreur, les lignes déjà validées restent dans la table cible. Avant de relancer, il faut donc soit vider manuellement les données concernées dans la cible, soit mettre en place une reprise manuelle au bon point afin d'éviter les doublons.
