---
id: TCK-2373
title: "Les tuiles du tableau de bord d'agence lisent `kpi_configs`"
status: done
phase: P3
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#64-kpiconfig-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-249--valeurs-de-choix-acceptées-et-rangées-sans-effet"
tags: [back, front, tableau-de-bord, agence, kpi, pistes]
---

## Objectif

Ce qu'une agence règle dans l'écran « Indicateurs » (`/app/overview/kpis`) apparaît sur son
tableau de bord (`/app/overview/agency`) : les métriques activées, dans l'ordre, avec le libellé
saisi et le format choisi.

## Contexte

Réf : **P249.02** du fichier de pistes, `validé`.

L'écran « Indicateurs » enregistre métrique, libellé, format, rang et activation dans `kpi_configs`,
et promet de mettre ces indicateurs « en avant sur le tableau de bord de votre agence ». Aucun code
ne lisait la table : `KpiResolver` calculait ses 14 métriques sans elle, et `AgencyKpis.tsx` rendait
six tuiles fixes.

## Décision du porteur

validé — validation du porteur (2026-10-25) : les tuiles du tableau de bord d'agence lisent `kpi_configs` : métriques activées, dans l'ordre, avec leur libellé et leur format

## Hypothèses (mode sans humain)

- **Les valeurs viennent de l'API.** `GET /api/dashboard/agency` sert `data.kpis`, une liste de
  `{metric, label, format, value}` ; la valeur est lue par `KpiResolver::flatten()` dans le résumé
  déjà calculé, la même table de correspondance que les alertes de seuil. Le front ne calcule rien.
- **Les 14 métriques de `KpiConfig::allowedMetrics()` ont toutes une valeur servie** (mesuré : la
  liste blanche et les clés de `KpiResolver` coïncident). Une ligne dont la métrique sortirait de
  cette table est omise, jamais rendue à zéro.
- **L'ordre** : `sort_order`, puis `id` à rang égal.
- **Sans configuration activée, les six tuiles par défaut restent** — y compris pour une agence qui
  a tout désactivé. C'est l'option qui ne retire rien : une agence ne perd pas son bandeau en
  décochant sa dernière ligne.
- **Les tuiles configurées remplacent les six tuiles par défaut**, sans s'y ajouter : sinon un même
  chiffre figurerait deux fois (règle de TCK-647).
- **Format `percent`** : la valeur est lue en points (0..100), comme les métriques `*_percent` de
  l'API. Une valeur `null` (pas de dénominateur, TCK-1114 et TCK-1177) s'affiche en tiret.
- **Une requête de plus, constante**, pour lire `kpi_configs` : le plafond `agency` de
  `DashboardQueryBudgetTest` passe de 29 à 30 (mesuré 29 avant, 30 après), comme le relèvement
  `owner` de TCK-2151.

## Delta à produire

- [x] `KpiResolver::flatten()` (extrait de `forAgency()`) et `KpiResolver::configuredTiles()`.
- [x] `DashboardAgencyController::show` ajoute `data.kpis`.
- [x] `AgencyKpis.tsx` rend `summary.kpis` quand la liste n'est pas vide ; type
      `DashboardAgencyKpi`.
- [x] `docs/features.md` § 2.5 et `docs/models-spec.md` § 64.

## Critères d'acceptation

- [x] AC1 — sans configuration, `data.kpis` vaut `[]` et le tableau de bord garde ses six tuiles.
- [x] AC2 — trois lignes activées de rangs 2, 1, 3, plus une désactivée et une d'une autre agence →
      `data.kpis` porte les trois activées de l'agence, dans l'ordre 1, 2, 3, avec libellé, format,
      et la valeur que le résumé sert déjà (`occupancy.rate_percent`, `finance.revenue_month`).
- [x] AC3 — `occupancy_rate_percent` / « Taux » / `percent` sans bien éligible → `value: null`,
      rendu « — » et non « 0 % ».
- [x] AC4 — le composant rend les tuiles configurées dans l'ordre servi, libellé saisi, valeur
      formatée selon `number`, `percent` ou `currency`.

## Notes d'implémentation

- Tests : `DashboardAgencyKpiTilesTest` (3 tests, API), `AgencyKpis.test.tsx` (3 tests de plus).
  Avant correctif : les 3 tests API rouges (`data.kpis` absent), 2 des 3 tests front rouges (le
  troisième, tuiles par défaut sans configuration, garde la non-régression).
- Ablations API, une à une, chacune rouge puis rétablie verte :
  - la ligne `$data['kpis'] = …` retirée → 3 rouges ;
  - le filtre `is_enabled` retiré → AC2 rouge ;
  - le tri `sort_order` retiré → AC2 rouge ;
  - la borne `agency_id` remplacée par `whereNotNull` → AC2 rouge.
- Ablations front : la branche configurée neutralisée → 2 rouges ; le `/ 100` du format `percent`
  retiré → 1 rouge ; le tiret des valeurs `null` retiré → 1 rouge.
- Hors périmètre, vu au passage : la liste de l'écran « Indicateurs » n'affiche toujours ni le
  format ni le rang (constat de la piste, non tranché par la décision). Une agence `individual`
  peut configurer ses indicateurs (features § 1.12), mais n'a pas de tableau de bord d'agence
  (`agency.standard_only`) : ses réglages restent sans écran qui les montre.
