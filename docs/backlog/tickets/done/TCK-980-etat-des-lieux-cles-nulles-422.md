---
id: TCK-980
title: "Modifier un état des lieux avec general_condition ou rooms à null rend 422, plus 500"
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
    - "docs/features.md#19-état-des-lieux--inventaires"
  models:
    - "docs/models-spec.md#24-inventory-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-54--règles-nullable-face-aux-colonnes-not-null"
tags: [api, inventory, validation, pistes]
---

## Contexte

Réf : **P54.05** du fichier de pistes, `retenu · autonome` (A1). `inventories.general_condition`
et `inventories.rooms` sont `NOT NULL` sans défaut ; `InventoryUpdateRequest` les déclarait
`nullable`, et `InventoryService::update()` garde le `null` d'une clé présente comme un effacement
voulu. Re-mesuré le 2026-10-19 sur `pre-dev` 70d05c24b par le test de garde : `PATCH
/api/inventories/{id}` (propriétaire, `draft`) avec `general_condition: null` ou `rooms: null` →
**500** `QueryException`. `PUT` mène à la même action.

## Objectif

Un `null` sur `general_condition` ou `rooms` rend 422 et laisse l'état des lieux intact ; `notes`
garde son effacement par `null`.

## Delta à produire

- [x] `InventoryUpdateRequest` : `nullable` remplacé par `filled` sur `general_condition` et `rooms`.
- [x] `tests/Feature/Api/InventoryEditTest.php` : un cas par clé (fournisseur de données) et un cas
      « `notes: null` efface toujours ».

## Critères d'acceptation

- [x] AC1 — `PATCH /api/inventories/{id}` avec `general_condition: null` ou `rooms: null` → 422 sur
      la clé, `general_condition`, `rooms` et `notes` inchangés en base.
- [x] AC2 — `PATCH` avec `notes: null` → 200, `notes` à `null`.

## Hypothèses (mode sans humain)

- `filled` plutôt que `sometimes` + `filled` : `filled` seul laisse passer une clé omise et refuse
  une clé présente vide ou nulle, ce que dit la `Piste` ; c'est la forme de TCK-703 et TCK-976.
- `InventoryService::update()` n'est pas touché : le maintien du `null` reste juste pour `notes`.

## Hors périmètre

- `InventoryUpdateRequest` étend `FormRequest` et non `BaseFormRequest` : hors de cette piste.

## Notes d'implémentation

- Avant correctif : 2 rouges sur 8 (deux 500). Ablation : `InventoryUpdateRequest` remise à sa
  version de `pre-dev` → 2 rouges ; correctif réappliqué → 8 verts, et 21 verts avec `InventoryTest`.
