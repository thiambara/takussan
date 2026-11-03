---
id: TCK-1357
title: "« Interventions ouvertes » : un seul prédicat, `MaintenanceRequest::open()`, pour les trois tableaux de bord"
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
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-127--indicateurs-des-tableaux-de-bord-de-lagent-du-bailleur-et-de-dashboardme"
tags: [api, dashboard, maintenance, pistes]
---

## Contexte

Réf : **P127.03** du fichier de pistes, `validé` (V7 accordé).

Les tableaux de bord de l'agent, de l'agence et du locataire comptaient « ouvert » par
`whereIn('status', [Open, InProgress])`, écrit trois fois à la main. Une demande `acknowledged`,
`assigned`, `awaiting_owner`… sortait du compteur au moment même où elle avançait. La clé
`maintenance_open` de `/dashboard/me` et des KPI d'agence en héritait.

## Décision du porteur

porteur (2026-10-22) : un seul prédicat partagé (scope `MaintenanceRequest::open()`) qui exclut `completed`, `closed`, `cancelled` et `rejected`

## Objectif

Les trois tableaux de bord comptent toute intervention hors `completed`, `closed`, `cancelled` et
`rejected`, par un seul scope.

## Delta à produire

- [x] `MaintenanceRequest::FINISHED_STATUSES` et `scopeOpen()`.
- [x] `DashboardAgentService`, `DashboardAgencyService`, `DashboardTenantService` : `->open()`.
- [x] `DashboardMaintenanceOpenTest` : le scope, et un cas par tableau de bord (une demande par état).

## Critères d'acceptation

- [x] AC1 — Le scope rend les huit états non finis, et eux seuls.
- [x] AC2 — Une demande par état des douze : `maintenance.open = 8` sur `/dashboard/agent`,
      `/dashboard/agency`, `/dashboard/tenant`, et `maintenance_open = 8` sur `/dashboard/me` (agent).

## Hors périmètre

- `AgentPortfolio::CLOSED_MAINTENANCE` et le filtre de `CalendarEventCollector` portent déjà les
  mêmes quatre états ; les faire lire `FINISHED_STATUSES` serait un remaniement sans changement de
  résultat, laissé hors du diff.
- Les seuils d'alerte d'agence sur `maintenance_open` ne sont pas revus : leur valeur choisie par
  une agence s'applique désormais au compte élargi.

## Notes d'implémentation

- Ablation : les trois services remis à `3dd2a8205` → les trois tests de tableau de bord rougissent
  (`2` au lieu de `8`), le test du scope reste vert ; remis → verts.
