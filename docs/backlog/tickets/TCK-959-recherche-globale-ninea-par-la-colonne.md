---
id: TCK-959
title: "La recherche globale de la console trouve une agence par son NINEA en colonne"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-recherche-globale-du-super-admin-ne-trouve-plus-une-agence-par-son-ninea"
tags: [back, admin, search, pistes]
---

## Contexte

Réf : **P47.01** du fichier de pistes, `retenu · autonome` (A1).

`AdminGlobalSearchService::byToken` cherchait le NINEA dans `metadata->'legal_info'->>'ninea'`.
Depuis TCK-594, la source est la colonne `agencies.ninea`, que l'écran d'agence et le passage en
`standard` écrivent ; plus rien n'écrit `metadata.legal_info.ninea`. Une agence dont le NINEA est
posé aujourd'hui est introuvable par lui (TCK-600 le veut cherchable « par l'agence »). Le test
existant semait l'ancienne forme et restait vert.

## Objectif

Le NINEA d'une agence la retrouve dans la recherche globale, qu'il vive en colonne ou, pour une
valeur que la migration n'a pas recopiée, encore dans `metadata`.

## Hypothèses (mode sans humain)

- Le repli sur `metadata.legal_info` reste : la migration `2026_10_07_200500` n'y recopie pas une
  valeur plus longue que la colonne (30), qui reste donc là.

## Delta à produire

- [x] `byToken` : `agencies.ninea = ?` ou `metadata->'legal_info'->>'ninea' = ?`.
- [x] `AdminGlobalSearchTest` : le test du NINEA sème la colonne ; un test du repli.

## Critères d'acceptation

- [x] AC1 — `Agency.ninea = '005012345'` → `GET /api/admin/search?q=005012345` rend l'agence.
- [x] AC2 — un NINEA resté dans `metadata.legal_info` (colonne nulle) se trouve encore.
- [x] AC3 — le NINEA d'une demande de passage ne se trouve toujours pas.

## Hors périmètre

- `metadata.legal_info` exposé et décrit comme la source (P47.06).

## Notes d'implémentation

- Avant correctif : le test réécrit rougit (`[]` au lieu de l'agence).
- Ablations : correctif retiré → ce rouge ; repli seul retiré → le test du repli rougit. Remis →
  11 verts.
