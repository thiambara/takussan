---
id: TCK-1306
title: "Export PDF : plafond ramené à 200 lignes, dit à l'écran, gardé par la mémoire"
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
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-112--exports-synchrones-de-exportcontroller-et-du-registre-des-demandes-de-droits"
tags: [api, front, export, pdf, memoire, pistes]
---

## Contexte

Réf : **P112.01** du fichier de pistes, `validé` (V7 accordé).

Le PDF d'export est rendu par dompdf dans la requête, sous `memory_limit = 256M`
(`docker/php.ini:3`). Son plafond, qui est aussi son défaut sans `limit`, était de 2 000 lignes
(TCK-713) ; un PDF de paiements mourait à 400 lignes (« Allowed memory size … exhausted »).

## Décision du porteur

> porteur (2026-10-22) : `MAX_ROWS_PDF` ramené à 200 et dit à l'écran avec la coupure de P112.03, garde de mémoire comprise ; le PDF en file reste à faire ensuite

## Objectif

Un PDF d'export s'obtient toujours, au plus 200 lignes, et l'écran dit le plafond.

## Delta à produire

- [x] `ExportDataService::MAX_ROWS_PDF` = 200 (la règle `limit` de `ShowExportRequest` le suit).
- [x] Garde : `ExportMemoireAuPlafondTest` rend le PDF des paiements au plafond et borne le
      surcroît de mémoire allouée à 128 Mo (la moitié des 256M).
- [x] `/app/overview/exports` dit le plafond : 5 000 lignes par fichier (le défaut, le formulaire
      n'envoie aucune `limit`), 200 en PDF. Clé `dashboard.exports.rowCap` ; en `wo`, le texte
      français (wolof en pause).

## Critères d'acceptation

- [x] AC1 — `GET /api/export/payments?format=pdf` sur 205 paiements rend 200 lignes sous la borne.
- [x] AC2 — `limit=201` en PDF est refusé en 422.
- [x] AC3 — le formulaire affiche « au plus 5 000 lignes, 200 en PDF ».

## Hors périmètre

- Le PDF en file (job, notification, lien) : « reste à faire ensuite », dit le porteur.
- Le signal de coupure : TCK-1308 (P112.03).

## Notes d'implémentation

- Rouge avant correctif : au plafond de 2 000, le processus de test meurt
  (`Allowed memory size of 536870912 bytes exhausted`, dompdf `Text.php:516`), le test relevant
  le plafond à 512M pour qu'un dépassement modeste échoue en assertion plutôt qu'en erreur fatale.
- La mesure est `memory_get_peak_usage(true)` : c'est ce que `memory_limit` compte. Avec
  `memory_get_peak_usage()` (usage interne), 400 lignes passaient sous 128 Mo. Mesuré : 90 Mo
  pour 200 lignes, 176 Mo pour 400 (ablation : plafond à 400 → rouge).
- Les plafonds affichés sont recopiés côté front (`PLAFOND_LIGNES_EXPORT*` de
  `lib/queries/exports.ts`) ; ablation : 2 000 → le test du formulaire rougit.
