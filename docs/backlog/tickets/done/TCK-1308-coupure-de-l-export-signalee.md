---
id: TCK-1308
title: "Export coupé au plafond : signalé par X-Export-Truncated et dit à l'écran"
status: done
phase: P1
family: full
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1306]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-112--exports-synchrones-de-exportcontroller-et-du-registre-des-demandes-de-droits"
tags: [api, front, export, pistes]
---

## Contexte

Réf : **P112.03** du fichier de pistes, `validé` (V7 accordé).

Sans `limit`, l'export rend 5 000 lignes (200 en PDF depuis TCK-1306) et coupe le reste en
silence : 5 001 paiements rendaient 5 000 lignes, sans en-tête ni texte (mesuré).

## Décision du porteur

> porteur (2026-10-22) : demander plafond + 1 lignes, signaler la coupure par un en-tête `X-Export-Truncated` lu par le relais et le formulaire, et dire le plafond à l'écran, sans ligne ajoutée au fichier

## Objectif

Qui télécharge un export coupé le sait, et sait à combien de lignes.

## Delta à produire

- [x] API : les neuf constructeurs de `ExportDataService` lisent `limit + 1` lignes ; `collect()`
      retire la ligne de trop et pose `truncated` ; `ExportController` ajoute
      `X-Export-Truncated: <lignes rendues>` quand l'export est coupé. Le fichier ne change pas.
- [x] Relais `/api/export/[entity]` : transmet `x-export-truncated`.
- [x] `ExportForm` : télécharge par le relais en `fetch` (et non plus par `window.open`, d'où aucun
      en-tête ne se lit), puis dit la coupure (`dashboard.exports.truncated`). Le plafond est déjà
      dit à l'écran par TCK-1306 (`rowCap`).

## Critères d'acceptation

- [x] AC1 — 5 001 paiements sans `limit` : `X-Export-Truncated: 5000`, 5 000 lignes de données.
- [x] AC2 — 5 000 paiements : aucun en-tête.
- [x] AC3 — `limit` demandée, et PDF : signalés de même.
- [x] AC4 — le relais transmet l'en-tête, le formulaire affiche la coupure.

## Hypothèses

- La valeur de l'en-tête est le nombre de lignes rendues, pour que l'écran le dise sans recopier
  le plafond.
- Passer de l'onglet au `fetch` retire la page où l'erreur de l'API s'affichait : un échec se dit
  donc dans le formulaire (`dashboard.exports.failed`), sans quoi il serait muet.
- En `wo`, les deux textes sont en français (wolof en pause).

## Hors périmètre

- Le PDF en file (reste de P112.01) ; la mémoire du XLSX au plafond (P112.02, reclassée).

## Notes d'implémentation

- Tests : `ExportCoupureSignaleeTest` (4), `ExportColonnesEtPlafondTest` (`limit N + 1` sur les
  neuf entités), `route.coupure.test.ts`, `ExportForm.coupure.test.tsx`.
- Ablations : `+ 1` retiré → 3 rouges sur 4 ; en-tête non posé → 3 rouges ; relais sans
  `x-export-truncated` → rouge ; formulaire qui lit un autre en-tête → rouge. Remis → vert.
- Le `PdfBuilder` est `Responsable` : il est converti par `toResponse()` avant d'y poser l'en-tête.
