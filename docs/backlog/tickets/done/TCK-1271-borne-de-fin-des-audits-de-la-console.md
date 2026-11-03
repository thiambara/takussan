---
id: TCK-1271
title: "Audit de la console et activité d'un compte : une date de fin seule couvre tout le jour choisi"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-119--requêtes-de-base-passées-à-buildquery-et-querybuilderfor"
tags: [api, console, audit, pistes]
---

## Contexte

Réf : **P119.02** du fichier de pistes, `retenu · autonome` (A1).

`filter[date_to]` de `GET /api/admin/audit` (et de son export, même `filteredQuery()`) et de
`GET /api/admin/users/{id}/activity` devient `created_at <= <valeur brute>` ; le sélecteur de date
envoie `yyyy-MM-dd`, la borne vaut donc minuit au début du jour choisi : « du 22 au 22 » ne rend
rien, et toute plage perd son dernier jour. Le journal de l'agence (`AuditLogController`) porte
déjà la règle attendue, `normalizeRangeBoundary()` : une date seule couvre le jour entier.

## Objectif

Les trois lectures du journal bornent leurs dates par une seule normalisation, celle du journal
de l'agence.

## Delta à produire

- [x] `AuditLogController::normalizeRangeBoundary()` extraite dans un filtre commun
      (`App\Http\Filters\DateBoundaryFilter`), à l'identique : date seule → début ou fin du jour,
      date et heure → telle quelle.
- [x] Le filtre sous `date_from`/`date_to` de `AuditLogController::index`,
      `CrossTenantAuditController::filteredQuery()` et `UserDetailController::activity()` ; les
      paramètres plats `from`/`to` du journal de l'agence par la même normalisation.
- [x] Test : une ligne à midi, plage du jour au jour → 1 ligne, sur l'audit de la console et sur
      l'activité d'un compte.

## Critères d'acceptation

- [x] AC1 — `GET /api/admin/audit?filter[date_from]=J&filter[date_to]=J` rend une ligne écrite
      le jour J à midi.
- [x] AC2 — `GET /api/admin/users/{id}/activity?filter[date_from]=J&filter[date_to]=J` de même.
- [x] AC3 — Le journal de l'agence garde son comportement (ses tests restent verts).

## Hors périmètre

- Une date illisible (500) : P119.03, TCK-1273.
- Le front : il envoie déjà `yyyy-MM-dd`, rien n'y change.

## Notes d'implémentation

- Test : `tests/Feature/Audit/BornesDeDateDeLaConsoleTest.php`. Avant correctif : 0 ligne au
  lieu de 1 sur les deux routes.
- Ablation : `DateBoundaryFilter` remis à la valeur brute → les deux tests rouges ; remis → verts.
  `AuditLogTest`, `ActivityLogEndpointTest` (bornes du journal de l'agence) et
  `CrossTenantAuditExportTest` restent verts.
- La normalisation est reprise à l'identique (`toDateTimeString()`, seconde pleine) : la borne
  haute vaut `23:59:59`, comme au journal de l'agence.
