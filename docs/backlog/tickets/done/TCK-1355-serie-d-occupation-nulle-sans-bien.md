---
id: TCK-1355
title: "La série mensuelle d'occupation rend `null` pour un mois sans bien éligible, et le graphique s'y coupe"
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
tags: [api, web, dashboard, bailleur, agence, graphiques, pistes]
---

## Contexte

Réf : **P127.02** du fichier de pistes, `validé` (V7 accordé).

`PortfolioMetrics::longStayOccupancy` rendait `0.0` pour un mois sans bien éligible, et les
tableaux de bord du bailleur et de l'agence recopiaient la série en `?? 0.0`. Un mois où le
portefeuille n'avait encore aucun bien était tracé « tout vacant », là où l'occupation du jour et la
série courte durée rendent `null` (« rien à occuper n'est pas tout vacant », TCK-1114).

## Décision du porteur

porteur (2026-10-22) : `null` pour un mois sans bien, types en `(number | null)[]`, et `LineChart` coupe le tracé sur un point `null`

## Objectif

Un mois sans bien éligible longue durée vaut `null` dans `timeseries.occupancy` de
`/dashboard/owner` et `/dashboard/agency`, et le graphique ne le trace pas.

## Delta à produire

- [x] `PortfolioMetrics::longStayOccupancy` : `null` sans capacité, type `array<string, float|null>`.
- [x] `DashboardOwnerService` et `DashboardAgencyService` : `?? null` pour la série.
- [x] Front : `LineChartSeries` (`values: (number | null)[]`) et `LineChartData` ; `LineChart` ouvre
      un nouveau segment après un point `null` ; `DashboardAgencyTimeseries.occupancy` et
      `TimeseriesPayload` admettent `null`.

## Critères d'acceptation

- [x] AC1 — Seul bien mensuel créé le mois courant : `occupancy = [null, null, 0]` sur trois mois,
      pour le bailleur et pour l'agence.
- [x] AC2 — `LineChart` sur `[null, 40, null, 50, 60]` : deux segments, le premier sans trait, aucun
      `NaN`.

## Hors périmètre

- `BarChart` garde `number[]` : une barre absente et une barre à zéro s'y confondraient, et aucune
  série à trou n'y passe.

## Hypothèses

- Un point isolé entre deux `null` ne trace rien (un `M` seul) : la décision dit « coupe le
  tracé », sans point dessiné.

## Notes d'implémentation

- Ablation : `PortfolioMetrics`, les deux services et `LineChart.tsx` remis à `3dd2a8205` → le test
  API (`[0, 0, 0]`) et le test de `LineChart` (un seul segment) rougissent ; remis → verts.
