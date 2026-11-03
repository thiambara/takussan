---
id: TCK-1866
title: "Les trois tableaux de bord et la console des boosts ignorent une valeur en liste au lieu de rendre 500"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-188--paramètres-de-date-et-de-nombre-lus-à-la-main-hors-de-filter"
tags: [api, dashboard, boosts, validation, pistes]
---

## Contexte

Réf : **P188.07** du fichier de pistes, `retenu · autonome` (A1). Les contrôleurs des tableaux de
bord du bailleur, de l'agent et de l'agence castent `(string) $request->input('include', '')`, et
`AdminBoostController::index` caste `(string)` les filtres `status`, `kind` et `agency_id` :
une valeur en liste (`include[]=timeseries`, `filter[status][]=active`) rend 500 « Array to string
conversion ». TCK-1407 a fixé la réponse d'une valeur en liste : celle d'une valeur absente.

## Objectif utilisateur

Un appel mal formé à ces quatre routes est servi comme si le paramètre manquait, au lieu
d'accuser le serveur.

## Contrat de données

Aucun changement pour une valeur en chaîne. `include` en liste : pas de `timeseries`. `status`,
`kind`, `agency_id` en liste : pas de filtre.

## Delta à produire

- [x] `DashboardOwnerController`, `DashboardAgentController`, `DashboardAgencyController` :
  `is_string()` avant le découpage d'`include`.
- [x] `AdminBoostController::index` : `is_string()` avant `tryFrom()` et `ctype_digit()`.
- [x] Test : `tests/Feature/Api/ValeursEnListeTableauxDeBordEtBoostsTest.php` (un cas par route).

## Critères d'acceptation

- [x] AC1 — `dashboard/owner|agent|agency?include[]=timeseries` → 200, sans `timeseries`.
- [x] AC2 — `admin/boosts?filter[status][]=active`, `filter[kind][]=x`, `filter[agency_id][]=1`
  → 200.

## Reste à faire

- `months=abc` des trois tableaux de bord rend 200 sur une série d'un seul mois, sans le dire :
  choisir entre le défaut de douze mois et un 422 (laissé hors du correctif par la mesure).

## Hors périmètre

- `filter[agency_id][]` n'était pas cité par la piste : même cause, même ligne, même correctif.

## Notes d'implémentation

- Reproduction : les quatre tests neufs rouges avant correctif, « Array to string conversion ».
- Ablation : les quatre contrôleurs remis à l'état de `pre-dev` → 4 rouges ; correctif remis →
  4 verts. `DashboardOwnerTest` 6, `DashboardAgencyTest` 11, `DashboardAgentTest` 7 et
  `AdminCreditsApiTest` 7 verts.
