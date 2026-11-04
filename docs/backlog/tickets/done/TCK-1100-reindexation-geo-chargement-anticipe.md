---
id: TCK-1100
title: "GeoReindexation charge d'avance l'agence, l'adresse et les étiquettes des biens"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#91-geoneighborhood-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-90--écritures-explicites-dans-lindex-face-aux-transactions-et-à-scout_queue"
tags: [back, recherche, performance, pistes]
---

## Contexte

Réf : **P90.05** du fichier de pistes, `retenu · autonome` (A2 : chargement anticipé, sans
changement de résultat).

`GeoReindexation::biens()` parcourt les biens par `chunkById(200)` sans `with()` :
`shouldBeSearchable()` charge l'agence, `toSearchableArray()` l'adresse et les étiquettes
visibles, bien par bien. `Property::makeAllSearchableUsing()` et
`SyncAgencyPropertiesSearchIndex` les chargent déjà d'avance.

## Objectif

Le nombre de requêtes de `biens()` ne dépend plus du nombre de biens d'un lot.

## Delta à produire

- [x] `GeoReindexation::biens()` : `with('address', 'tagsVisibles', 'agency')`.
- [x] Test : même nombre de requêtes pour 3 et 10 biens ; les biens réindexés sont dans l'index.

## Critères d'acceptation

- [x] AC1 — `biens()` sur 3 biens et sur 10 biens d'agence, avec adresse, rend le même nombre de requêtes.
- [x] AC2 — Les biens passés sont dans l'index après l'appel (résultat inchangé).

## Hors périmètre

- `RefreshNewBuildSearchLabel`, même motif : P90.06 (TCK-1101).

## Notes d'implémentation

- Test : `tests/Feature/Geo/GeoReindexationRequetesTest.php`. Avant correctif : 3 biens → 10
  requêtes, 10 biens → 31 (1 + 3 par bien).
- Ablation : `GeoReindexation.php` rendu à `HEAD` → le même rouge (10 contre 31) ; correctif
  remis → vert.
