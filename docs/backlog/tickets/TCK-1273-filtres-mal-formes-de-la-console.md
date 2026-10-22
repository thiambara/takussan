---
id: TCK-1273
title: "Console des utilisateurs et audits : un identifiant d'agence ou une date mal formés ne rendent plus 500"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1271]
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-119--requêtes-de-base-passées-à-buildquery-et-querybuilderfor"
tags: [api, console, audit, validation, pistes]
---

## Contexte

Réf : **P119.03** du fichier de pistes, `retenu · autonome` (A1).

`GET /api/admin/users?filter[agency_id]=abc` rend 500 (`SQLSTATE[22P02]`), et une date illisible
sous `filter[date_from]`/`filter[date_to]` rend 500 sur `GET /api/admin/users/{id}/activity` et
`GET /api/admin/audit` (`SQLSTATE[22007]`). Les deux réponses attendues sont déjà écrites dans le
dépôt : 400 `filter.identifier_invalid` pour un identifiant (`ExactIdentifierFilter`), et la règle
`date` des `FormRequest` (422) pour une date (`ExportActivityLogRequest`, `SearchQueryRequest`).

## Objectif

Une requête dont le filtre d'agence ou de date est mal formé reçoit l'erreur client déjà en usage,
au lieu d'un 500.

## Delta à produire

- [x] `filter[agency_id]` de `GET /api/admin/users` : la règle d'`ExactIdentifierFilter` (400
      `filter.identifier_invalid`), par une méthode publique du filtre plutôt qu'une copie.
- [x] `DateBoundaryFilter` (TCK-1271) refuse une valeur que la règle `date` refuse (et une liste),
      en 422 sur `filter.<nom>` — ce qui couvre aussi le journal de l'agence, dont
      `Carbon::parse()` levait sur la même valeur.
- [x] Tests : les requêtes ci-dessus rendent 400 ou 422, plus 500.

## Critères d'acceptation

- [x] AC1 — `GET /api/admin/users?filter[agency_id]=abc` → 400, code `filter.identifier_invalid`.
- [x] AC2 — `GET /api/admin/users/{id}/activity?filter[date_from]=nawak` → 422 sur
      `filter.date_from`.
- [x] AC3 — `GET /api/admin/audit?filter[date_to]=nawak` → 422 sur `filter.date_to`.

## Hors périmètre

- La page `/super-admin/users` qui recopie `?agency=` sans le lire comme un nombre : le front
  reçoit désormais un 400 lisible ; le lire côté client serait un second correctif.
- Le même relevé sur le reste de l'API : angle 151.

## Notes d'implémentation

- Test : `tests/Feature/Admin/Platform/FiltresMalFormesDeLaConsoleTest.php`. Avant correctif :
  `filter[agency_id]=abc` rend **200** (liste vide) et non plus 500, parce que TCK-1269 lit la
  valeur par `(int)` ; les deux dates rendent 500 (`InvalidFormatException` de `Carbon::parse()`
  depuis TCK-1271, `SQLSTATE[22007]` avant).
- Ablation : l'appel à `ExactIdentifierFilter::exiger()` et la validation de `DateBoundaryFilter`
  commentés → les trois tests rouges ; remis → verts. `FiltreIdentifiantTest` reste vert.
- Une liste (`filter[date_to]=a,b`, que spatie découpe) est refusée par la règle `string`.
