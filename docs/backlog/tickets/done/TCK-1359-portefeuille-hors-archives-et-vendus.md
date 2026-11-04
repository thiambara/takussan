---
id: TCK-1359
title: "Le portefeuille du bailleur et les biens gérés de l'agent ne comptent plus les biens archivés ni vendus"
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
tags: [api, dashboard, bailleur, agent, pistes]
---

## Contexte

Réf : **P127.04** du fichier de pistes, `validé` (V7 accordé).

`portfolio.total` du bailleur et `properties_managed` de l'agent étaient un `COUNT(*)` de leurs
biens sans condition de statut : un bien archivé ou vendu restait affiché sous « Portefeuille ».

## Décision du porteur

porteur (2026-10-22) : le portefeuille compte les biens hors `archived` et `sold`, `draft`, `pending_review` et `rejected` gardés ; écrit dans `docs/features.md`

## Objectif

Les deux compteurs, et leurs reprises dans `/dashboard/me`, écartent les biens `archived` et `sold`.

## Delta à produire

- [x] `Property::OUT_OF_PORTFOLIO_STATUSES` (`archived`, `sold`).
- [x] `DashboardOwnerService` : `portfolio.total` en `COUNT(*) FILTER (WHERE status NOT IN …)`.
- [x] `DashboardAgentService` : `properties_managed` compté hors de ces statuts, dans la même requête
      que les identifiants du périmètre (les réservations en attente lisent toujours tout le périmètre).
- [x] `DashboardPortfolioCountTest` : un bien par statut, bailleur et agent (`mine`, `agency`, `/me`).

## Critères d'acceptation

- [x] AC1 — Bailleur avec un bien `archived`, `sold`, `draft`, `pending_review`, `rejected`,
      `available` : `portfolio.total = 4`, `/dashboard/me` `portfolio_total = 4`.
- [x] AC2 — Même jeu pour l'agent : `properties_managed = 4` en `mine`, en `agency` (admin) et sur
      `/dashboard/me`.

## Reste à faire

- Écrire la définition dans `docs/features.md` : la spec est fermée à l'implémenteur des pistes
  (ADR-0066), elle revient au porteur ou à `/sync-specs`.

## Hors périmètre

- `TeamPerformanceService` (`properties_managed` du rapport d'équipe) n'est pas dans le `Où` de la
  piste et garde sa lecture.
- `portfolio.rented` et `portfolio.available` comptent un statut précis : inchangés.

## Notes d'implémentation

- Ablation : les deux services remis à `3dd2a8205` → les deux tests rougissent (`6` au lieu de `4`) ;
  remis → verts.
- Le périmètre `agency` est refusé à un agent (403, `DashboardAgentScopeTest`) : le test le lit en
  admin d'agence.
