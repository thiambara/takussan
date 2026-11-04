---
id: TCK-1856
title: "L'export du journal juge l'ordre et la borne d'un an sur la plage exportée, aussi quand une seule borne est donnée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1854]
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-188--paramètres-de-date-et-de-nombre-lus-à-la-main-hors-de-filter"
tags: [api, audit, validation, i18n, pistes]
---

## Contexte

Réf : **P188.02** du fichier de pistes, `retenu · autonome` (A1). TCK-104 écrit la borne d'un an
sur la plage exportée et le défaut des trente derniers jours. `ExportActivityLogRequest` ne jugeait
l'écart que si les deux bornes étaient fournies (`if ($from && $to)`), puis `resolvedFilters()`
complétait la borne absente : `filter[date_from]=2000-01-01` seul → 200, un export de 26 ans servi ;
`filter[date_to]=2099-01-01` seul → 200 aussi. Les deux messages du rappel étaient de l'anglais en
dur.

## Objectif utilisateur

L'export du journal ne sert jamais plus d'un an de lignes, quelle que soit la combinaison de bornes
saisie, et le refus se lit dans la langue de la requête.

## Contrat de données

`GET /api/activity-logs/export` : mêmes paramètres. Une plage résolue de plus d'un an, ou dont la
borne de début suit celle de fin, rend 422, sur la borne donnée par l'appelant
(`filter.date_from` quand elle est donnée, sinon `filter.date_to`).

## Delta à produire

- [x] `ExportActivityLogRequest::withValidator()` : juger l'ordre et l'écart sur les bornes de
  `resolvedFilters()`.
- [x] Clés `errors.activity_log.date_range_inverted` et `errors.activity_log.date_range_too_long`
  en `fr`, `en` et `wo` (en `wo`, le texte français : le wolof est en pause).
- [x] Test : `ActivityLogExporterTest::test_la_borne_d_un_an_vaut_aussi_avec_une_seule_borne`.

## Critères d'acceptation

- [x] AC1 — `filter[date_from]=2000-01-01` seul → 422 sur `filter.date_from`.
- [x] AC2 — `filter[date_to]=2099-01-01` seul → 422 sur `filter.date_to`.
- [x] AC3 — témoin : `filter[date_from]` à 200 jours d'aujourd'hui, seul → 200.
- [x] AC4 — les cas à deux bornes de TCK-104 rendent toujours 422.

## Hors périmètre

- Un plafond de lignes du CSV (relevé par P78.03 pour le XLSX).

## Notes d'implémentation

- Conséquence voulue du jugement sur la plage résolue : `filter[date_to]` seul, antérieur de plus
  de trente jours à aujourd'hui, rend désormais 422 (plage vide inversée) au lieu d'un export vide.
- Le texte anglais garde les deux messages d'origine mot pour mot ; le français est neuf.
- Reproduction : le test neuf rouge avant correctif (`date_from=2000-01-01` seul → 200).
- Ablation : requête remise à l'état de TCK-1854 → 1 rouge ; correctif remis → 1 vert
  (7 assertions). `ActivityLogExporterTest` entier 19 verts, `LangGroupParityTest` 4 verts,
  `ExportAuditXlsxBorneTest` 2 verts.
