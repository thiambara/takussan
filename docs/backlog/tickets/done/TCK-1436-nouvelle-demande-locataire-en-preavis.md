---
id: TCK-1436
title: "« Nouvelle demande » d'intervention proposée au locataire en préavis, comme l'API l'accepte"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-162--compteurs-et-sélecteurs--en-cours--écrits-par-une-liste-de-statuts-à-la-main"
tags: [api, web, maintenance, pistes]
---

## Contexte

Réf : **P162.04** du fichier de pistes, `retenu · autonome` (A1). `store()` admet le locataire
d'un bail `active` ou `terminating` depuis TCK-1001, mais `MaintenanceRequestPolicy::openRequests`,
qui se dit « les mêmes que `store()` », exige encore `active` : `can_create` est faux en préavis et
le bouton disparaît. Le lanceur ne liste que les baux `active` : en préavis, l'écran montre
« contactez l'agence ».

## Objectif

Le locataire en préavis se voit proposer la demande que l'API accepte déjà.

## Delta à produire

- [x] `openRequests` lit `User::ACTIVE_TENANT_LEASE_STATUSES`.
- [x] `MaintenanceNewLauncher` demande `filter[status]=active,terminating`.

## Critères d'acceptation

- [x] AC1 — Locataire au seul bail `terminating` : `meta.abilities.can_create = true`, et la création rend 201.
- [x] AC2 — `GET /api/leases?filter[status]=active,terminating` rend son bail en préavis.
- [x] AC3 — Le lanceur demande les deux statuts et propose le bien d'un bail en préavis.

## Hors périmètre

- L'autorisation réelle (`store()`), inchangée.

## Notes d'implémentation

- Ablation : policy remise à `bba57a9e0` → `MaintenanceProviderListTest` rouge (`can_create` faux) ;
  lanceur remis → `MaintenanceNewLauncher.test.tsx` rouge (`active` au lieu de `active,terminating`) ;
  remis → verts.
