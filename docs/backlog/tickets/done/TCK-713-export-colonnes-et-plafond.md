---
id: TCK-713
title: "L'export ne charge que ses colonnes, plafonné à 10 000 lignes (2 000 en PDF)"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes
tags: [api, export, performance, pistes]
---

## Contexte

Réf : **P02.07** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`GET /api/export/{entity}` est synchrone. `ExportDataService` y faisait `limit(≤ 50 000)->get()`
sans `select`, jsonb compris, pour les neuf entités, et `ShowExportRequest` acceptait
`limit=50000` en CSV, Excel comme en PDF. Mesuré avant correctif sur `8ca7d33f` : les neuf exports
lisent `select * from "<table>"`, `limit=10001` et `format=pdf&limit=2001` rendent 200, et un PDF
sans `limit` demande `limit 5000`.

## Décision du porteur

colonnes sélectionnées ; plafond de 10 000 lignes (2 000 en PDF)

## Objectif

Un export ne lit que les colonnes qu'il écrit, et ne dépasse jamais 10 000 lignes, ni 2 000 en PDF.

## Delta à produire

- [x] `ExportDataService` : un `select` des colonnes exportées (et des clés des relations
      chargées) sur les neuf requêtes ; constantes `MAX_ROWS`, `MAX_ROWS_PDF`, `DEFAULT_ROWS` et
      `maxRows($format)` ; `limit()` borne au plafond du format.
- [x] `ShowExportRequest` : `limit` au plus `ExportDataService::maxRows(format)`.
- [x] Test `tests/Feature/Api/ExportColonnesEtPlafondTest.php`.

## Critères d'acceptation

- [x] AC1 — Aucun des neuf exports ne lit `*` sur sa table, et aucun ne lit une colonne absente
      du `select` (`preventAccessingMissingAttributes`).
- [x] AC2 — La balance âgée garde le reste dû d'un paiement partiel (`metadata.paid_amount`).
- [x] AC3 — `limit=10001` → 422 ; `limit=10000` → 200.
- [x] AC4 — `format=pdf&limit=2001` → 422 ; `format=xlsx&limit=2001` → 200.
- [x] AC5 — Sans `limit`, l'export demande 5 000 lignes en CSV et 2 000 en PDF.

## Hypothèses (mode sans humain)

- Une `limit` explicite au-delà du plafond est **refusée** (422), comme l'était déjà une `limit`
  au-delà de 50 000 ; le défaut de 5 000, que le front envoie implicitement (il ne passe jamais
  `limit`), est **ramené** à 2 000 en PDF au lieu d'être refusé.
- `excel` et `xlsx` suivent le plafond de 10 000.

## Hors périmètre

- La réponse en flux (`lazyById()`) et la tâche en file : la décision retient le plafond.
- Le front ne dit pas qu'un export est tronqué au plafond : il ne l'a jamais dit à 5 000 non plus.

## Notes d'implémentation

- Ablation : correctif retiré (service et FormRequest) → 12 rouges sur 14 ; remis → 14 verts.
  `metadata` retirée du seul `select` de la balance âgée → AC2 rouge (le reste dû tombe à
  100 000) : `remaining_amount` la lit par `??`, que `preventAccessingMissingAttributes` ne voit
  pas.
