---
id: TCK-1411
title: "Les filtres exacts d'une colonne entière ou booléenne jugent la valeur avant PostgreSQL"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-151--valeurs-de-filter-passées-brutes-à-une-colonne-typée"
tags: [back, filtres, pistes]
---

## Objectif utilisateur

`filter[assigned_to]=abc`, `filter[bedrooms]=abc` ou `filter[featured]=abc` rendent une erreur
de saisie (400 ou 422), plus une erreur du serveur.

## Contexte

Réf : **P151.03** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Mesuré avant correctif (garde ci-dessous, rouge sur `e72d2ad69`) : un filtre exact sur une
colonne `int*`/`bool` qui ne finit pas par `_id`, donné `abc` → `SQLSTATE[22P02]` ;
`filter[published_at]` des biens accepté.

## Décision du porteur (déléguée)

> retirer `published_at` des filtres exacts de `Property` (aucun lecteur) ; déclarer dans chaque modèle les filtres exacts typés par une liste (`identifiant`, `entier`, `booléen`) plutôt que par le cast, absent de `assigned_to`, `uploaded_by`, `invited_by`, `conducted_by`, `submitted_by`, `reviewed_by`, `bedrooms` et `bathrooms` ; un identifiant passe par `ExactIdentifierFilter` (400 `filter.identifier_invalid`), un entier ou un booléen par la règle `integer` ou `boolean` du validateur (422, sans code neuf, comme `DateBoundaryFilter`) ; garde : `FiltreIdentifiantTest` étendu à chaque filtre exact typé, avec `abc`

## Hypothèses (mode sans humain)

- La déclaration est un tableau `$requestFilterableTypes` (`colonne => type`) dans chaque
  modèle, lu par `HasQueryBuilder`. Les trois types sont des constantes de `TypedExactFilter`.
- Une liste (`1,2`) d'entiers ou de booléens est jugée élément par élément.
- `filter[is_verified]=1|0` et `filter[is_active]=1|0`, qu'envoie le front, passent la règle
  `boolean`.

## Delta à produire

- [x] `TypedExactFilter` (règle `integer` ou `boolean`, 422) ; `HasQueryBuilder` lit
  `$requestFilterableTypes` (identifiant → `ExactIdentifierFilter`).
- [x] Quinze modèles déclarent leurs filtres typés ; `published_at` retiré des filtres exacts de
  `Property`.
- [x] Tests : trois méthodes neuves de `FiltreIdentifiantTest` (garde dérivée des colonnes,
  témoins lisibles, `published_at`).

## Critères d'acceptation

- [x] AC1 — Chaque filtre exact d'une colonne entière ou booléenne refuse `abc` (400 ou 422).
- [x] AC2 — Une valeur lisible filtre toujours (`assigned_to`, `is_verified=true`, `bedrooms=2`).
- [x] AC3 — `filter[published_at]` des biens est un filtre inconnu (400 de spatie).

## Reste à faire

> `filter[price]` exact des biens (colonne décimale) rend encore 500 sur `abc` : il n'entre dans aucun des trois types de la décision (identifiant, entier, booléen)

## Notes d'implémentation

- La garde dérive la liste des types de colonne en base (`int*`, `bool`) : un filtre typé
  ajouté sans déclaration la fait rougir.
- Ablation : `HasQueryBuilder.php` et `Property.php` rendus à leur état antérieur → 2 rouges ;
  remis → 16 verts.
