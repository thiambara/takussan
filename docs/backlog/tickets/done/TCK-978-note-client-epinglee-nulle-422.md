---
id: TCK-978
title: "Une note client envoyée avec pinned à null rend 422, plus 500"
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
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#33-customernote-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-54--règles-nullable-face-aux-colonnes-not-null"
tags: [api, crm, validation, pistes]
---

## Contexte

Réf : **P54.03** du fichier de pistes, `retenu · autonome` (A1). `customer_notes.pinned` est
`boolean()->default(false)`, `NOT NULL` ; `StoreCustomerNoteRequest` déclarait `pinned`
`nullable|boolean`, et `CustomerNoteController::store()` écrit `validated()` tel quel. Re-mesuré le
2026-10-19 sur `pre-dev` 1da537089 par le test de garde : `POST /api/customers/{id}/notes` avec
`pinned: null` → **500**.

## Objectif

`pinned: null` rend 422 ; une clé omise donne toujours une note non épinglée.

## Delta à produire

- [x] `StoreCustomerNoteRequest` : `pinned` en `filled|boolean`.
- [x] `tests/Feature/Api/CustomerNoteTest.php` : un cas `null` (422, aucune note) et un cas omis.

## Critères d'acceptation

- [x] AC1 — `POST /api/customers/{id}/notes` avec `pinned: null` → 422 sur `pinned`, aucune note créée.
- [x] AC2 — Sans `pinned` → 201, note non épinglée.

## Hypothèses (mode sans humain)

- `filled` plutôt que `sometimes` (la `Piste` laisse les deux) : forme retenue par TCK-703 pour le
  même défaut. Le front n'envoie jamais `pinned: null` (lu).

## Hors périmètre

- Aucune autre règle de note client.

## Notes d'implémentation

- Avant correctif : 1 rouge sur 8 (500). Ablation : la règle remise à `nullable` → 1 rouge ;
  correctif réappliqué → 8 verts.
