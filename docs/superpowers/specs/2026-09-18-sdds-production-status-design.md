# Mapping des statuts de production SDDS

## Objectif

Adapter l'import SDDS pour exploiter les deux nouveaux champs de statut fournis par l'API :

- `plant_declared_formula_status_text` ;
- `plant_sap_formula_status_text`.

Ces valeurs déterminent désormais `FAB_DATE`, `FIRST_FAB` et `LAST_FAB`. Elles sont également conservées dans les nouvelles colonnes Oracle `PLANT_DECLARED_STATUS` et `PLANT_SAP_STATUS`.

## Sélection du statut effectif

Le statut déclaré est prioritaire lorsqu'il contient une valeur autre que des espaces :

1. utiliser `plant_declared_formula_status_text` s'il est non nul et non vide après suppression des espaces externes ;
2. sinon, utiliser `plant_sap_formula_status_text`.

La valeur retenue est normalisée uniquement pour la comparaison : suppression des espaces externes et passage en minuscules. Les valeurs originales reçues de l'API sont conservées dans les colonnes Oracle.

## Règles de mapping

| Statut effectif normalisé | `FAB_DATE` | `FIRST_FAB` | `LAST_FAB` |
|---|---|---|---|
| `in production` | `first_batch_date` | `O` | `N` |
| `end production` | `last_batch_date` | `O` | `O` |

Pour toutes les lignes acceptées :

- `FIRST_FAB_DATE` vaut `NULL` ;
- `PLANT_DECLARED_STATUS` reçoit la valeur originale de `plant_declared_formula_status_text` ;
- `PLANT_SAP_STATUS` reçoit la valeur originale de `plant_sap_formula_status_text`.

Le reste du mapping existant demeure inchangé.

## Validation et rejets

Une ligne est rejetée sans interrompre le traitement des autres lignes dans les cas suivants :

- aucun statut effectif n'est disponible : `missing_production_status` ;
- le statut effectif est différent de `In Production` et `End Production`, sans tenir compte de la casse : `unsupported_production_status` ;
- le statut est `In Production` et `first_batch_date` est absente : `missing_first_batch_date_for_in_production` ;
- le statut est `End Production` et `last_batch_date` est absente : `missing_last_batch_date_for_end_production` ;
- une date non nulle est invalide : les motifs de rejet existants relatifs aux dates sont conservés.

Chaque rejet est écrit dans le journal avec la page, le code formule, le code usine et le motif. Les valeurs des statuts peuvent être ajoutées au contexte du journal afin de faciliter le diagnostic.

## Composants concernés

### Mapper

Le mapper centralise :

- la sélection du statut déclaré ou SAP ;
- la normalisation utilisée pour la comparaison ;
- la validation du statut et de la date obligatoire ;
- le calcul de `FAB_DATE`, `FIRST_FAB` et `LAST_FAB` ;
- l'initialisation de `FIRST_FAB_DATE` à `NULL` ;
- la copie des deux valeurs de statut dans la ligne destinée à Oracle.

Cette centralisation garantit un résultat identique en mode production et en mode génération SQL.

### Repository Oracle

L'INSERT dans `FL_FORMULA_IMPORT.DGO_PRODUCTION_EVENT_V2` inclut les colonnes :

- `PLANT_SAP_STATUS` ;
- `PLANT_DECLARED_STATUS`.

Les paramètres Oracle correspondants sont définis comme des chaînes de caractères avec une taille compatible avec les colonnes de la table.

### Génération SQL

Les fichiers SQL du mode développement incluent les deux nouvelles colonnes et leurs valeurs échappées. Ils appliquent exactement le résultat produit par le mapper et n'exécutent aucune insertion.

## Cas de test

Les tests couvrent au minimum :

1. priorité du statut déclaré sur le statut SAP ;
2. repli sur le statut SAP quand le statut déclaré est nul, vide ou composé d'espaces ;
3. comparaison insensible à la casse et aux espaces externes ;
4. mapping de `In Production` avec `first_batch_date` ;
5. mapping de `End Production` avec `last_batch_date` ;
6. `FIRST_FAB_DATE` toujours à `NULL` ;
7. conservation des valeurs originales des deux statuts ;
8. rejet d'un statut absent ;
9. rejet d'un statut inconnu ;
10. rejet de `In Production` sans première date ;
11. rejet de `End Production` sans dernière date ;
12. présence des nouvelles colonnes dans l'INSERT Oracle et les fichiers SQL.

## Hors périmètre

- modification de la procédure Oracle `change_status_prod` ;
- modification des libellés de statut renvoyés par SDDS ;
- déduction du statut à partir des seules dates lorsqu'il est absent ou inconnu ;
- alimentation de `FIRST_FAB_DATE` avec `first_batch_date`.
