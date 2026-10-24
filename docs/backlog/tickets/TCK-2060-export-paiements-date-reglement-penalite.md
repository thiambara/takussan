---
id: TCK-2060
title: "L'export des paiements rend la date de règlement de la pénalité de retard"
status: done
phase: P2
family: feature
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-206--pénalités-de-retard-réglées-face-aux-lecteurs-de-largent"
tags: [api, export, paiements, pistes]
---

## Objectif

L'export des paiements distingue une pénalité de retard réglée d'une pénalité due : colonne
`late_fee_paid_at`, en dernière position.

## Contexte

Réf : **P206.05** du fichier de pistes, `validé (délégué)`.

### Décision du porteur (déléguée)

> validé (délégué) — ajouter `late_fee_paid_at` à l'export des paiements, en dernière colonne, valeur en base sans calcul (`toDateTimeString()` comme `paid_at`, ou `null`), sur le modèle de `refund_amount` (TCK-1135) ; reste : le moyen de règlement de la pénalité (aujourd'hui dans `metadata.late_fee_payment_method`), et la correction de `docs/features.md:218` et d'ADR-0039 § 3, qui suit P206.01

- `ExportDataService::payments()` portait `late_fee_amount` et `refund_amount`, sans
  `late_fee_paid_at`.

## Hypothèses (mode sans humain)

- Aucune.

## Delta à produire

- [x] `late_fee_paid_at` lu, rendu en dernière colonne (`toDateTimeString()` ou `null`).

## Critères d'acceptation

- [x] AC1 — Pénalité réglée : la colonne rend sa date en base ; c'est la dernière colonne, et les
  clés de la ligne suivent l'ordre des colonnes.
- [x] AC2 — Pénalité due : la colonne rend `null`.

## Reste à faire

le moyen de règlement de la pénalité (aujourd'hui dans `metadata.late_fee_payment_method`), et la correction de `docs/features.md:218` et d'ADR-0039 § 3, qui suit P206.01

## Hors périmètre

- Les autres exports.

## Notes d'implémentation

- Tests dans `takussan-api/tests/Feature/Api/LeasePaymentResourceContractTest.php` (deux cas
  neufs). L'assertion de TCK-1135 « `refund_amount` en dernière colonne » devient « avant-dernière »,
  comme la décision le veut.
- Avant correctif : 3 rouges (les deux cas neufs et l'avant-dernière place de `refund_amount`).
  Ablation : `ExportDataService.php` remis à son état avant ce ticket → 3 rouges ; remis → 11 verts.
