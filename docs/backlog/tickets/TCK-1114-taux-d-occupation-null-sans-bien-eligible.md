---
id: TCK-1114
title: "Taux d'occupation longue durée null sans bien éligible : ni 0 %, ni alerte"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#65-thresholdalert-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-93--indicateurs-des-tableaux-de-bord-et-du-relevé--valeurs-fausses-sur-des-données-réelles"
tags: [back, front, dashboard, notifications, pistes]
---

## Contexte

Réf : **P93.05** du fichier de pistes, `validé (délégué)` (V7 accordé).

Sans bien éligible longue durée, `PortfolioMetrics::longStayOccupancyToday` rendait `0.0`, alors que
l'occupation courte durée rend `null` sans dénominateur (TCK-595, contrat de données).
`KpiResolver` et `dashboard:check-alerts` remplaçaient de plus toute valeur absente par 0 : une
agence sans aucun bien recevait l'alerte « occupation sous le seuil », et la tuile affichait 0 %.

## Décision du porteur (déléguée)

`occupancy.rate_percent` rend `null` sans bien éligible longue durée, comme `short_stay_percent` (TCK-595, contrat de données) ; `KpiResolver` garde ce `null` pour `occupancy_rate_percent`, et `dashboard:check-alerts` n'évalue pas une alerte dont la valeur est `null` ; le front type `rate_percent: number | null` et affiche un tiret sur la tuile « Taux d'occupation » de l'agence et du bailleur ; un test épingle l'agence sans bien (valeur `null`, aucune notification)

## Reste à faire

le `null` de `unpaid_rate_percent` sans dénominateur, qui relève de P93.03 et reste au porteur

## Objectif utilisateur

Une agence ou un bailleur sans bien de location voit un tiret sur la tuile « Taux d'occupation », et
ne reçoit aucune alerte d'occupation.

## Delta à produire

- [x] `PortfolioMetrics::longStayOccupancyToday` : `?float`, `null` sans bien éligible.
- [x] `KpiResolver::forAgency` : `occupancy_rate_percent` garde le `null`.
- [x] `CheckThresholdAlertsCommand` : une métrique présente et `null` n'est pas évaluée (ni
      notification, ni `last_triggered_at`).
- [x] Front : `rate_percent: number | null` dans `dashboard-agency.ts` et `dashboard.ts` ;
      `formatOccupancyRate` (`components/dashboard/occupancy.ts`) rend un tiret, employé par la tuile
      de l'agence (`AgencyKpis`) et par celle du bailleur (`overview/owner/page.tsx`).
- [x] Tests : `DashboardAgencyTest`, `DashboardOwnerTest`, `ThresholdAlertTest`,
      `AgencyKpis.test.tsx`, `occupancy.test.ts`.

## Critères d'acceptation

- [x] AC1 — `GET /api/dashboard/agency` d'une agence sans bien : `occupancy.rate_percent` vaut
      `null` (clé présente), et `KpiResolver` rend `occupancy_rate_percent` `null`.
- [x] AC2 — `GET /api/dashboard/owner` d'un bailleur sans bien : `occupancy.rate_percent` `null`.
- [x] AC3 — Agence sans bien, alerte `occupancy_rate_percent < 50` activée : `dashboard:check-alerts`
      n'envoie rien et ne tamponne pas l'alerte.
- [x] AC4 — La tuile « Taux d'occupation » affiche « — » pour `null` ; 0 reste « 0 % ».

## Hors périmètre

- Le reste ci-dessus (P93.03, au porteur).
- `OwnerMeMetrics` (`/api/dashboard/me` du bailleur) garde `?? 0.0` sur `occupancy_rate_percent` :
  aucune tuile de `DashboardMeKpis` ne lit cette clé.
- La série mensuelle `timeseries.occupancy` (`?? 0.0` par mois).

## Notes d'implémentation

- Ablation API : les trois fichiers de `app/` rendus à `HEAD` → 3 rouges sur les 3 tests neufs ;
  remis → 34/34 sur les quatre classes du tableau de bord touchées.
- Ablation front : `formatOccupancyRate` ramené à `formatPercent((rate ?? 0) / 100)` → 2 rouges
  sur 8 ; remis → 8/8.
- La commande ne saute que la clé **présente et `null`** : une métrique absente du résolveur garde
  son repli à 0, comme avant.
