---
id: TCK-1860
title: "La série mensuelle du tableau de bord de l'agent ne se décale plus d'un mois les jours de fin de mois"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-188--paramètres-de-date-et-de-nombre-lus-à-la-main-hors-de-filter"
tags: [api, dashboard, dates, pistes]
---

## Contexte

Réf : **P188.04** du fichier de pistes, `retenu · autonome` (A1).
`DashboardAgentService::monthlyTimeseries()` part de `now()->subMonths($months - 1)->startOfMonth()`.
`subMonths()` déborde : le 31 octobre, onze mois plus tôt tombe un « 31 novembre », soit le
1ᵉʳ décembre, et la série rend `2025-12` … `2026-11` (novembre 2025 manque, la série finit sur un
mois à venir). Les services du bailleur et de l'agence écrivent déjà `subMonthsNoOverflow()`.

## Objectif utilisateur

L'agent voit, chaque jour du mois, les douze derniers mois jusqu'au mois courant.

## Contrat de données

`GET /api/dashboard/agent?include=timeseries` : même forme ; seule la fenêtre des étiquettes est
corrigée les jours où le mois de départ est plus court que le jour courant.

## Delta à produire

- [x] `DashboardAgentService::monthlyTimeseries()` : `subMonthsNoOverflow()`.
- [x] Test : `DashboardAgentTest::test_la_serie_mensuelle_ne_deborde_pas_les_jours_de_fin_de_mois`.

## Critères d'acceptation

- [x] AC1 — le 2026-10-31, douze étiquettes de `2025-11` à `2026-10`.
- [x] AC2 — le 2027-01-29, douze étiquettes de `2026-02` à `2027-01`.

## Hors périmètre

- Le calcul des commissions et des baux de chaque mois, inchangé.

## Notes d'implémentation

- Reproduction : le test neuf rouge avant correctif (`2025-12` au lieu de `2025-11`).
- Ablation : service remis à l'état de `pre-dev` → 1 rouge ; correctif remis → 1 vert
  (6 assertions). `DashboardAgentTest` entier 7 verts.
