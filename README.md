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

Renseignez les huit variables de `.env` :

- `TOKEN_URL` : URL du serveur OAuth ;
- `API_URL` : URL de l'API SDDS ;
- `CLIENT_ID` : identifiant du client OAuth ;
- `CLIENT_SECRET` : secret du client OAuth ;
- `SCOPE` : périmètre OAuth demandé ;
- `ORACLE_USER` : utilisateur Oracle ;
- `ORACLE_PASSWORD` : mot de passe Oracle ;
- `ORACLE_CONNECT_STRING` : chaîne de connexion Oracle ;
- `ALLOW_INSECURE_TLS` : `true` pour désactiver explicitement la validation TLS, sinon `false`.

Ne versionnez jamais `.env`, les mots de passe, les jetons ou tout autre secret.

## Exécution

```powershell
node src/index.js
```

Avec `ALLOW_INSECURE_TLS=true`, le programme positionne `NODE_TLS_REJECT_UNAUTHORIZED=0` avant les appels OAuth et API. Cette option désactive globalement la validation des certificats HTTPS et ne doit être utilisée que sur un réseau maîtrisé. La solution recommandée reste l'installation du certificat d'entreprise avec `NODE_EXTRA_CA_CERTS`.

L'import parcourt l'API par pages de 50 éléments. Les événements dont les références formule ou usine sont absentes ou introuvables sont ignorés et journalisés. Les lignes valides sont insérées par lots avec `executeMany`, et une validation Oracle (`commit`) est effectuée toutes les 20 pages ainsi qu'à la fin.

Chaque exécution crée `logs/import-<date>.jsonl`. Ce fichier contient les rejets, les pages traitées, les commits et l'erreur technique finale avec la dernière page atteinte. Les jetons et secrets connus sont masqués. Les mêmes événements restent visibles dans la console, suivis du résumé final.

En cas de redémarrage après une erreur, les lignes déjà validées restent dans la table cible. Avant de relancer, il faut donc soit vider manuellement les données concernées dans la cible, soit mettre en place une reprise manuelle au bon point afin d'éviter les doublons.
