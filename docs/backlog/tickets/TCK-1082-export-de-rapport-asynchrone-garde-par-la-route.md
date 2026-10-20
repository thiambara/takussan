---
id: TCK-1082
title: "Le chemin asynchrone de l'export de rapport est gardé par un test qui passe par la route"
status: done
phase: P2
family: tests
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#62-reportexport-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#generatereportexport-nest-atteint-par-aucun-rapport--le-seuil-de-10-000-lignes-dépasse-le-plus-long-rapport-60-lignes"
tags: [back, reporting, super-admin, tests, pistes]
---

## Objectif utilisateur

Le comportement que TCK-227 écrit pour un gros export (« l'export > 10k lignes passe en async et
notifie par email ») reste garanti, alors qu'aucun rapport réel n'atteint aujourd'hui le seuil.

## Contexte

Réf : **P78.04** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`ReportingController::export()` ne met en file `GenerateReportExport` qu'au-delà de
`ASYNC_THRESHOLD_ROWS = 10_000` lignes ; le plus long rapport en rend 60. Re-mesuré : les deux
tests qui exercent le job appellent `handle()` à la main
(`PlatformReportingTest::test_the_async_export_writes_the_same_csv_as_the_synchronous_one`,
`ReportExportDownloadTest`), aucun ne passe par la route ni n'attend un 202.

## Décision du porteur (déléguée)

> garder le chemin asynchrone de `ReportingController::export()` et son seuil de 10 000 lignes, comme TCK-227 l'écrit ; aucun code de production changé ; test par la route : un `PlatformReportingService` substitué dans le conteneur rend 10 001 lignes → 202, `GenerateReportExport` mis en file (`Queue::fake`), ligne `report_exports` `queued`

## Reste à faire

le retrait du chemin ou un seuil abaissé, au porteur

## Hypothèses (mode sans humain)

- Le service substitué est une sous-classe anonyme de `PlatformReportingService` (classe non
  `final`), qui ne redéfinit que `funnel()`.

## Delta à produire

- [x] Test `PlatformReportingTest::test_an_export_above_the_threshold_is_queued_by_the_route`.
- [x] Aucun code de production.

## Critères d'acceptation

- [x] AC1 — 10 001 lignes → `GET /api/admin/reports/funnel/export` rend 202, `data.status` `queued`.
- [x] AC2 — `GenerateReportExport` est mis en file une fois.
- [x] AC3 — la ligne `report_exports` est `queued`, sans `ready_at`, avec son `row_count` et son demandeur.

## Hors périmètre

- Le retrait du chemin asynchrone ou un seuil abaissé (le reste, au porteur).

## Notes d'implémentation

- Test vert d'emblée : il garde un chemin existant (A5). Ablations sur le code gardé : seuil
  neutralisé (`$async = false`) → rouge, 200 au lieu de 202 ; `dispatch` retiré → rouge, job mis
  en file 0 fois ; contrôleur remis → 31 verts sur la classe.
