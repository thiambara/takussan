---
id: TCK-1001
title: "Un locataire en préavis demande une intervention, et son accueil compte son bail"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-locataire-en-préavis-ne-peut-plus-demander-dintervention-et-son-accueil-compte-zéro-bail"
tags: [back, maintenance, dashboard, tenant, pistes]
---

## Contexte

Réf : **P48.04** du fichier de pistes, `validé` (critère V2 accordé).

`MaintenanceRequestController::store` n'accepte la demande d'un locataire que si son bail est
`active`, et `DashboardTenantService::summary` ne compte que les baux `active`. Un locataire en
préavis (`terminating`) reçoit 403 et voit zéro bail, alors que le rôle `tenant` le tient pour
un locataire en cours (`HasProfiles::ACTIVE_TENANT_LEASE_STATUSES`).

## Décision du porteur

> juger la création d'une intervention et le compte de baux de l'accueil du locataire par `HasProfiles::ACTIVE_TENANT_LEASE_STATUSES` : un locataire en préavis (`terminating`) habite encore le logement et peut demander une intervention ; un test de création par un locataire en `terminating` (porteur, 2026-10-19)

## Objectif

Un locataire en préavis demande une intervention et voit son bail compté, comme un locataire
dont le bail est `active`.

## Delta à produire

- [ ] `MaintenanceRequestController::store` : le bail du demandeur se juge par
  `User::ACTIVE_TENANT_LEASE_STATUSES`.
- [ ] `DashboardTenantService::summary` : `leases.active` compte les baux de cette même liste.
- [ ] Tests : création par un locataire `active`, `terminating` (201), `terminated`,
  `expired` (403) ; accueil d'un locataire avec un bail `terminating` et un `terminated`.

## Critères d'acceptation

- [ ] AC1 — `POST /api/maintenance-requests` par un locataire dont le seul bail sur le bien est
  `terminating` rend 201.
- [ ] AC2 — un bail `terminated` ou `expired` ne l'ouvre pas (403).
- [ ] AC3 — `GET /api/dashboard/tenant` compte un bail `terminating` dans `leases.active`, et
  pas un bail `terminated`.

## Hors périmètre

- Les autres sites qui jugent un bail par `LeaseStatus::Active` seul (non relevés par la piste).
- Le libellé de l'accueil côté front (inchangé : il lit le même nombre).

## Notes d'implémentation

_(à remplir par implementing-specs)_
