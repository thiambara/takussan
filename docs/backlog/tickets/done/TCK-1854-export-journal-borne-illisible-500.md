---
id: TCK-1854
title: "L'export du journal rend 422, et non 500, sur une borne de date illisible quand l'autre borne est donnée"
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
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-188--paramètres-de-date-et-de-nombre-lus-à-la-main-hors-de-filter"
tags: [api, audit, validation, pistes]
---

## Contexte

Réf : **P188.01** du fichier de pistes, `retenu · autonome` (A1). `ExportActivityLogRequest` juge
`filter.date_from` et `filter.date_to` par `date`, mais son rappel `after()` passe les deux valeurs
brutes à `Carbon::parse()` dès qu'elles sont remplies, sans regarder les erreurs déjà posées :
`filter[date_from]=abc&filter[date_to]=2026-01-01` → 500 `InvalidFormatException`, une borne en
liste → 500 `TypeError`. `IndexCalendarRequest::after()` sort déjà du rappel dans ce cas.

## Objectif utilisateur

Un administrateur qui exporte le journal avec une date mal saisie reçoit une erreur de validation
sur le champ fautif, comme quand l'autre borne est absente.

## Contrat de données

Aucun changement de forme : `GET /api/activity-logs/export`, mêmes paramètres ; seul le code de
réponse d'une borne illisible passe de 500 à 422.

## Delta à produire

- [x] `ExportActivityLogRequest::withValidator()` : sortir du rappel quand `filter`,
  `filter.date_from` ou `filter.date_to` porte déjà une erreur.
- [x] Test : `ActivityLogExporterTest::test_une_borne_illisible_avec_l_autre_borne_rend_422`.

## Critères d'acceptation

- [x] AC1 — `filter[date_from]=abc&filter[date_to]=2026-01-01` → 422 sur `filter.date_from`.
- [x] AC2 — `filter[date_from][]=x&filter[date_to]=2026-01-01` → 422 sur `filter.date_from`.
- [x] AC3 — `filter[date_from]=2026-01-01&filter[date_to]=abc` → 422 sur `filter.date_to`.

## Hors périmètre

- La borne d'un an jugée sur une seule borne fournie : P188.02, TCK-1856.

## Notes d'implémentation

- Reproduction : le test neuf rouge avant correctif, `Could not parse 'abc'` (500).
- Ablation : `git checkout` de la requête → 1 rouge ; correctif remis → 1 vert (9 assertions).
