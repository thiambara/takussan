---
id: TCK-977
title: "Créer un forfait avec trial_days, is_active ou sort_order à null rend 422, plus 500"
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
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#43-plan-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-54--règles-nullable-face-aux-colonnes-not-null"
tags: [api, billing, admin, validation, pistes]
---

## Contexte

Réf : **P54.02** du fichier de pistes, `retenu · autonome` (A1). `plans.trial_days`, `is_active`
et `sort_order` sont `NOT NULL` avec un défaut (`0`, `true`, `0`) ; `StorePlanRequest` les déclarait
`nullable` et `PlanController::store()` passe `validated()` tel quel à `Plan::create()`.
Re-mesuré le 2026-10-19 sur `pre-dev` 1da537089 par le test de garde : `POST /api/admin/plans`
avec l'une des trois clés à `null` → **500** ; sans elles → 201. `UpdatePlanRequest` les déclare
déjà `sometimes`, sans `nullable`.

## Objectif

Un `null` sur l'une des trois clés rend 422 ; une clé omise prend le défaut de la colonne.

## Delta à produire

- [x] `StorePlanRequest` : `nullable` remplacé par `filled` sur `trial_days`, `is_active`, `sort_order`.
- [x] `tests/Feature/Api/Admin/BillingPlansTest.php` : un cas par clé (fournisseur de données) et
      un cas « clés omises ».

## Critères d'acceptation

- [x] AC1 — `POST /api/admin/plans` avec `trial_days`, `is_active` ou `sort_order` à `null` → 422
      sur la clé, aucun forfait créé.
- [x] AC2 — Sans ces clés → 201, avec `0`, `true`, `0`.

## Hypothèses (mode sans humain)

- `filled` plutôt que `sometimes` (la `Piste` laisse les deux, et les deux refusent le `null`) :
  c'est la forme retenue par TCK-703 pour le même défaut.
- Aucun montant ni échéance ne change : seule la validation d'entrée est touchée.

## Hors périmètre

- `StorePlanRequest` étend `FormRequest` et non `BaseFormRequest`, avec un `authorize()` à `true` :
  hors de cette piste, signalé dans le rapport.

## Notes d'implémentation

- Avant correctif : 3 rouges sur 13 (trois 500). Ablation : `StorePlanRequest` remise à sa
  version de `pre-dev` → 3 rouges ; correctif réappliqué → 13 verts.
