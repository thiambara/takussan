---
id: TCK-2177
title: "Le renouvellement borne ses conditions particulières, le devis ses décimales"
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
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#21-maintenancerequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-209--requêtes-de-modification-qui-ne-rejouent-pas-les-règles-de-la-création"
tags: [api, baux, maintenance, validation, pistes]
---

## Objectif

`POST /api/leases/{id}/renew` borne `special_conditions` comme la création d'un bail, et
`PATCH /api/maintenance-requests/{id}` refuse un `estimated_cost` à plus de deux décimales, comme
`actual_cost`.

## Contexte

Réf : **P209.05** du fichier de pistes (Petites améliorations), `validé` (V1 accordé).

Le renouvellement crée une ligne `leases` sans la borne de 5 000 caractères que la création pose
depuis TCK-1240 ; le devis d'une intervention était arrondi par la colonne `decimal(14,2)` sans
refus, et `5e5` s'écrivait 500 000.

## Décision du porteur

validé — validation du porteur (2026-10-24) : `max:5000` au renouvellement, avec la constante de la création, et `decimal:0,2` sur `estimated_cost`

## Hypothèses (mode sans humain)

- « La constante de la création » n'existait pas : la borne était écrite en dur (`max:5000`).
  Elle devient `StoreLeaseRequest::SPECIAL_CONDITIONS_MAX`, relue par `RenewLeaseRequest`.

## Delta à produire

- [x] `StoreLeaseRequest::SPECIAL_CONDITIONS_MAX = 5000`, lue par la création et le renouvellement.
- [x] `UpdateMaintenanceRequestRequest` : `decimal:0,2` sur `estimated_cost`.
- [x] Tests : `LeaseRenewalEndpointTest`, `MaintenanceActualCostTest`.

## Critères d'acceptation

- [x] AC1 — renouvellement avec 5 001 caractères de `special_conditions` → 422, bail parent
  inchangé ; 5 000 caractères → 201.
- [x] AC2 — `PATCH` `{estimated_cost: 1234.567}` et `{estimated_cost: "5e5"}` → 422, devis
  inchangé ; `1234.5` → 200.

## Hors périmètre

- `UpdateLeaseRequest` et les autres saisies de `special_conditions` ne sont pas relues ici.

## Notes d'implémentation

- Avant correctif : 6 000 caractères au renouvellement → 201 ; `1234.567` → 200.
- Ablation : `max` retiré du renouvellement → 1 rouge ; `decimal:0,2` retiré d'`estimated_cost`
  seul → 1 rouge ; remis → 6 et 13 verts.
