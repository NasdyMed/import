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
- `ORACLE_CONNECT_STRING` : chaîne de connexion Oracle.

Ne versionnez jamais `.env`, les mots de passe, les jetons ou tout autre secret.

## Exécution

```powershell
node src/index.js
```

L'import parcourt l'API par pages de 50 éléments. Les événements dont les références formule ou usine sont absentes ou introuvables sont ignorés et journalisés. Les lignes valides sont insérées par lots avec `executeMany`, et une validation Oracle (`commit`) est effectuée toutes les 20 pages ainsi qu'à la fin. Le programme affiche uniquement un résumé final avec le nombre de pages, d'éléments reçus, insérés et rejetés.

En cas de redémarrage après une erreur, les lignes déjà validées restent dans la table cible. Avant de relancer, il faut donc soit vider manuellement les données concernées dans la cible, soit mettre en place une reprise manuelle au bon point afin d'éviter les doublons.
