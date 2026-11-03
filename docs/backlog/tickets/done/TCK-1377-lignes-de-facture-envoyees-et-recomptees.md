---
id: TCK-1377
title: "Facture : les lignes saisies partent à l'API, qui recompte le sous-total et les imprime"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-133--estimations-et-aperçus-calculés-au-front-face-au-calcul-de-lapi"
tags: [api, web, invoices, pdf, pistes]
---

## Contexte

Réf : **P133.02** du fichier de pistes, `validé` par le porteur (critère accordé : V1, et le choix
V7 entre les deux options de la `Piste`). Le dialogue de facture fait saisir des lignes, en fait la
somme au navigateur et n'envoie que `subtotal` ; `StoreInvoiceRequest` ne connaît pas de lignes,
accepte tout sous-total, et le PDF imprime une ligne « Prestation » au montant total.

## Décision du porteur

> validé — porteur (2026-10-22) : envoyer les lignes saisies, et l'API recalcule le sous-total depuis elles

## Objectif

Les lignes saisies sont celles que la facture compte et imprime.

## Delta à produire

- [x] `StoreInvoiceRequest` : `items` (1 à 50 lignes ; `description`, `quantity` > 0, `unit_price`
      ≥ 0, bornes de `SubmitQuoteRequest`) ; `subtotal` requis seulement sans `items`.
- [x] `InvoiceService::create` : avec `items`, chaque ligne arrondie à l'unité de la devise, puis la
      somme (comme `MaintenanceQuoteWorkflow::priceLines`) ; le `subtotal` fourni est ignoré ; les
      lignes rangées dans `metadata.lines` ; un total au-delà de `decimal(14,2)` → 422
      `invoice.amount_too_large` (fr, en ; `wo` porte le français, wolof en pause).
- [x] `Invoice::lines()` et `DocumentPdfController::invoice` les passent au gabarit, qui les imprimait
      déjà s'il les recevait.
- [x] Le dialogue envoie `items` au lieu de `subtotal`, et son aperçu arrondit chaque ligne comme l'API.

## Critères d'acceptation

- [x] AC1 — Deux lignes (1 × 25 000, 2 × 10 000) et un `subtotal: 1` → sous-total 45 000, TVA et total
      sur 45 000, les deux désignations dans le PDF, « Prestation » absent.
- [x] AC2 — 3 × (1,5 × 333) en XOF → 1 500, à l'API comme à l'aperçu.
- [x] AC3 — Liste vide, ligne incomplète, ni lignes ni sous-total → 422 sur le champ en cause.
- [x] AC4 — Total au-delà de la colonne → 422 `invoice.amount_too_large`, pas une 500.
- [x] AC5 — Sans lignes, un `subtotal` reste accepté (rien d'autre n'appelait la route avec des lignes).

## Hypothèse

Pas de colonne neuve : `invoices.metadata` existe (`array`), et la `Piste` l'offre (`metadata.lines`).
Un avoir (`cancel`) ne recopie pas les lignes : il garde sa désignation « Annule la facture n° … ».

## Notes d'implémentation

- Ablation API : `InvoiceService`, `StoreInvoiceRequest`, `DocumentPdfController` et `Invoice`
  remis à leur état d'avant → `InvoiceLinesTest` 5 rouges ; remis → 5 verts.
- Ablation front : dialogue remis à l'état de TCK-1413 → les 2 tests neufs rougissent (charge sans
  `items`, aperçu `1499` au lieu de `1500`) ; remis → verts.
- jsonb réordonne les clés d'une ligne : le test compare par `assertEquals`.
- L'arrondi de l'aperçu passe d'abord au dix-millième, pour qu'un `1,005 €` ne tombe pas à `1,00`.
