---
id: TCK-976
title: "Une adresse envoyée avec un pays nul rend 422, plus 500, à la création et à la modification d'un bien"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#4-address"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-54--règles-nullable-face-aux-colonnes-not-null"
tags: [api, geo, validation, pistes]
---

## Contexte

Réf : **P54.01** du fichier de pistes, `retenu · autonome` (A1). C'est le reste que TCK-703 nommait
(« `country` a la même forme ») : `addresses.country` est `NOT NULL DEFAULT 'SN'`, et
`StorePropertyRequest` comme `UpdatePropertyRequest` déclaraient `address.country` `nullable`.
Re-mesuré le 2026-10-19 sur `pre-dev` 1da537089 par le test de garde : `POST /api/properties` et
`PATCH /api/properties/{id}` avec `address.country: null` → **500** (`QueryException`).

## Objectif

Un pays `null` (ou `""`, converti en `null`) est refusé en 422 sur les deux voies ; un pays omis
garde le comportement actuel (défaut `SN` à la création, pays inchangé à la modification).

## Delta à produire

- [x] `address.country` : `nullable` remplacé par `filled` dans les deux FormRequests (`sometimes`
      gardé pour le PATCH), comme `address.city` (TCK-703).
- [x] `tests/Feature/Geo/AdresseSansVilleTest.php` : trois cas (création nulle, création omise,
      modification nulle).

## Critères d'acceptation

- [x] AC1 — `POST /api/properties` avec `address.country: null` → 422 sur `address.country`, aucun bien créé.
- [x] AC2 — `PATCH /api/properties/{id}` avec `address.country: null` → 422, pays en base inchangé.
- [x] AC3 — Un pays omis à la création → 201 avec `SN`.

## Hypothèses (mode sans humain)

- Le contrat de TCK-703 (clé omise → défaut, `null` → 422) s'applique tel quel au pays, comme le
  prescrit la `Piste`. Le front n'envoie jamais `country: null` (lu).

## Hors périmètre

- Les autres colonnes `NOT NULL` à règle `nullable` de l'angle 54 : tickets voisins du même lot ou
  entrées encore ouvertes (P54.05 à P54.07).

## Notes d'implémentation

- Avant correctif : 2 rouges sur 9 (deux 500). Ablation : les deux FormRequests remises à leur
  version de `pre-dev` → 2 rouges ; correctif réappliqué → 9 verts.
