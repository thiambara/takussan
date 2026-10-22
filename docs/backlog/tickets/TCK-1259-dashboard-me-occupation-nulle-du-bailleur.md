---
id: TCK-1259
title: "`/dashboard/me` rend une occupation nulle au bailleur sans bien à occuper, comme `/dashboard/owner`"
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
tags: [api, dashboard, bailleur, pistes]
---

## Contexte

Réf : **P127.01** du fichier de pistes, `retenu · autonome` (A1).

`PortfolioMetrics::longStayOccupancyToday` rend `null` sans bien éligible : « rien à occuper n'est
pas tout est vacant » (TCK-1114). `KpiResolver` garde ce `null` (`?? null`) ; l'adaptateur du
bailleur de `/dashboard/me`, `OwnerMeMetrics`, le changeait en `0.0` (`?? 0.0`). Le même compte
lisait donc `null` sur `/dashboard/owner` et `0` sur `/dashboard/me`.

## Objectif

`metrics.occupancy_rate_percent` de `/dashboard/me` (bailleur) vaut ce que rend `/dashboard/owner`.

## Delta à produire

- [x] `OwnerMeMetrics` : `?? null` pour `occupancy_rate_percent`, comme `KpiResolver`.

## Critères d'acceptation

- [x] AC1 — Bailleur sans bien : `/dashboard/me` rend `occupancy_rate_percent: null`, et
      `/dashboard/owner` `occupancy.rate_percent: null`.
- [x] AC2 — Bailleur avec un bien éligible sans bail : la même valeur, non nulle, sur les deux.

## Hypothèses

- Aucun écran ne lit la clé du bailleur aujourd'hui (mesure de la piste) : le changement porte sur
  le contrat de l'API seul.

## Notes d'implémentation

- Ablation : `?? 0.0` remis → le test neuf rougit (`0` n'est pas `null`) ; remis → vert.
- Un bien de fabrique sans `contract_type` de location ni `rent_period` n'est pas éligible : la
  seconde moitié du test sème un bien loué au mois, sans quoi elle comparerait `null` à `null`.
