---
id: TCK-2065
title: "La création d'un bien refuse les statuts de modération, comme sa modification"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-209--requêtes-de-modification-qui-ne-rejouent-pas-les-règles-de-la-création"
tags: [api, biens, moderation, validation, pistes]
---

## Objectif

`POST /api/properties` refuse en 422 les statuts `pending_review`, `rejected` et `published`, que
TCK-1341 a retirés des requêtes de modification.

## Contexte

Réf : **P209.02** du fichier de pistes, `retenu · autonome` (A1).

- `PropertyStatus::NOT_SETTABLE_BY_HAND` réserve ces trois statuts aux gestes de modération
  (`resubmit`, `reject`, l'observateur), qui posent horodatage, motif et auteur.
  `UpdatePropertyRequest` et `UpdateStatusPropertyRequest` les excluent ; `StorePropertyRequest`
  prenait l'enum entier, et un bien naissait `pending_review` sans `submitted_at`, ou `rejected`
  sans motif.

## Hypothèses (mode sans humain)

- Aucun appelant légitime ne poste ces statuts à la création : le formulaire du front envoie
  `draft`/`private` (relevé du mesureur), et aucun test du dépôt ne le fait (`grep`).

## Delta à produire

- [x] `StorePropertyRequest` : `->except(PropertyStatus::NOT_SETTABLE_BY_HAND)` sur `status`.
- [x] `PropertyStatutsDeModerationTest` : le `POST` de chacun des trois statuts → 422, aucun bien
  créé ; un statut ouvert (`available`) reste accepté.

## Critères d'acceptation

- [x] AC1 — `POST /api/properties` avec `status` `pending_review`, `rejected` ou `published` → 422
  sur `status`, aucune ligne créée.
- [x] AC2 — `POST /api/properties` avec `status` `available` → 201.

## Hors périmètre

- La capacité `properties.publish` à la création (P209.01, à valider : V2).

## Notes d'implémentation

- Avant correctif : les trois cas `POST` rendent 201.
- Ablation : `->except(...)` retiré → 3 rouges ; remis → 11 verts.
