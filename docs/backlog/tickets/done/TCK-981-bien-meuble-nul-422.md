---
id: TCK-981
title: "Créer un bien avec furnished à null rend 422, plus 500"
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
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-54--règles-nullable-face-aux-colonnes-not-null"
tags: [api, properties, validation, pistes]
---

## Contexte

Réf : **P54.06** du fichier de pistes, `retenu · autonome` (A1). `properties.furnished` est
`NOT NULL DEFAULT false` ; `StorePropertyRequest` le déclarait `nullable|boolean`, et
`PropertyController::store()` passe `validated()` à `Property::create()` sans le remplacer.
Re-mesuré le 2026-10-19 sur `pre-dev` 70d05c24b par le test de garde : `POST /api/properties`
avec `furnished: null` → **500** `QueryException` ; sans la clé → 201, `furnished` à `false`.
`UpdatePropertyRequest` porte déjà `sometimes|boolean`.

## Objectif

Un `furnished: null` à la création rend 422 ; un `furnished` omis prend le défaut de la colonne.

## Delta à produire

- [x] `StorePropertyRequest` : `furnished` en `filled|boolean`.
- [x] `tests/Feature/Api/PropertyFurnishedNullTest.php` : `null` → 422, omis → `false`, `true` gardé.

## Critères d'acceptation

- [x] AC1 — `POST /api/properties` avec `furnished: null` → 422 sur `furnished`, aucun bien créé.
- [x] AC2 — Sans `furnished` → 201, `furnished` à `false` ; avec `true` → 201, `true`.

## Hypothèses (mode sans humain)

- `filled` plutôt que `sometimes` (la `Piste` laisse les deux) : forme de TCK-703 et TCK-976 dans
  la même requête.
- Le test vit dans une classe à part plutôt que dans `AdresseSansVilleTest`, qui ne porte que
  l'adresse : même harnais, même voie.

## Hors périmètre

- Les autres clés `nullable` de `StorePropertyRequest` : `currency: null` a été mesuré 201 par le
  mesureur ; les autres relèvent de P54.07.

## Notes d'implémentation

- Avant correctif : 1 rouge sur 3 (500). Ablation : `StorePropertyRequest` remise à sa version de
  `pre-dev` → 1 rouge ; correctif réappliqué → 3 verts, et 12 verts avec `AdresseSansVilleTest`.
