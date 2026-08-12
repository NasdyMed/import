# Mode DEV d’export SQL — Spécification de conception

## Objectif

Ajouter un mode DEV qui parcourt l’API SDDS et résout les références formule/usine dans Oracle comme le mode production, mais n’exécute aucune écriture Oracle. Les lignes valides sont transformées en scripts SQL Oracle, à raison de 20 pages API par fichier.

## Configuration et sécurité

- `IMPORT_MODE=production` conserve le comportement d’insertion actuel.
- `IMPORT_MODE=dev` active exclusivement l’export SQL.
- Toute autre valeur provoque un arrêt au démarrage.
- En mode DEV, la connexion Oracle reste nécessaire pour les deux requêtes `SELECT` de résolution.
- Le composant sélectionné en mode DEV n’expose aucune opération qui appelle `executeMany`, `commit` ou `rollback` sur la connexion Oracle.
- Le répertoire généré `sql/` est ignoré par Git.

## Mapping

Le mapping existant est conservé, avec une modification commune aux deux modes : `FRM_LABEL` vaut désormais `'-'` au lieu de `NULL`.

Les lignes dont `r_i_formula_code` ou `plant_code` est absent ou non résolu restent rejetées et journalisées. Elles ne figurent dans aucun fichier SQL.

## Fichiers générés

Chaque groupe de 20 pages produit un fichier indépendant :

```text
sql/import-pages-0001-0020.sql
sql/import-pages-0021-0040.sql
```

Le dernier fichier utilise la dernière page réellement traitée dans son nom, même s’il contient moins de 20 pages. Un groupe sans ligne valide produit tout de même un fichier documentant sa plage et contenant la terminaison Oracle.

Chaque ligne valide devient un `INSERT INTO fl_formula_import.dgo_production_event_v2`. Les littéraux sont sérialisés ainsi :

- chaîne : apostrophes doublées ;
- valeur absente : `NULL` ;
- date : `TO_DATE('YYYY-MM-DD', 'YYYY-MM-DD')` ;
- colonne `TIMESTAMP` : `SYSDATE`.

Chaque fichier commence par un commentaire indiquant la plage de pages et se termine exactement par :

```sql
COMMIT;
/
```

## Orchestration et résumé

L’importeur conserve le filtrage et le mapping communs, puis délègue les lignes valides à un dépôt sélectionné au démarrage : dépôt Oracle en production, dépôt de fichiers SQL en DEV.

Le dépôt DEV accumule au maximum 20 pages, écrit le fichier à la frontière du groupe, puis démarre le groupe suivant. La fin de flux force l’écriture du dernier groupe incomplet.

Le résumé DEV utilise un compteur `generated` pour les lignes écrites et garde `inserted` à zéro. Les événements de journalisation indiquent `sql_file_generated` avec la plage de pages, le chemin et le nombre de lignes. Aucun événement `transaction_committed` n’est émis en mode DEV.

## Vérification convenue

À la demande de l’utilisateur, cette évolution n’ajoute ni n’exécute de tests automatisés. La vérification comprend uniquement :

- contrôle syntaxique de tous les fichiers JavaScript modifiés ;
- génération locale avec données simulées, sans réseau ni connexion Oracle ;
- inspection du SQL produit ;
- contrôle Git des secrets et des fichiers générés ignorés.
