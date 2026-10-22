---
id: TCK-1518
title: "Changer le type ou le statut des états des lieux ramène la liste à la page 1"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-168--onglets-filtres-et-pagination-des-listes-tenus-en-état-local-plutôt-que-dans-lurl"
tags: [front, inventaires, pistes]
---

## Contexte

Réf : **P168.01** du fichier de pistes, `retenu · autonome` (A1). `InventoryList` tenait type,
statut et page en `useState`, et ses deux sélecteurs ne remettaient pas la page à 1 : un filtre
posé en page 2 ou 3 demandait une page au-delà de la dernière, et la liste s'affichait vide, sans
barre de pagination pour en sortir. `MaintenanceList`, `AuditTrail` et `CommissionsLedger`
remettent déjà la page à 1 à chaque filtre.

## Delta à produire

- [x] `InventoryList` : `setPage(1)` dans les deux `onValueChange`.
- [x] Test `InventoryListPagination.test.tsx`.

## Critères d'acceptation

- [x] AC1 — page 2, puis statut « Brouillon » → appel `{ status: 'draft', page: 1 }`.
- [x] AC2 — page 2, puis un type → appel en page 1.

## Hors périmètre

- Porter la vue de la liste dans l'URL (P168.03, au porteur).

## Notes d'implémentation

- Reproduction avant correctif : les deux tests rouges, appel resté en `page: 2`.
- Ablation : composant d'origine remis → 2 rouges ; correctif remis → 2/2 verts.
