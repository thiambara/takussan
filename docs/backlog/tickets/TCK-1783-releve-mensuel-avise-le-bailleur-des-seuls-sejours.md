---
id: TCK-1783
title: "L'avis mensuel du relevé de gérance part aussi au bailleur dont les seuls encaissements sont des acomptes de séjour"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-177--relevés-de-gérance-dune-période-close-recalculés-à-chaque-lecture"
tags: [api, payouts, notifications, pistes]
---

## Objectif utilisateur

Le bailleur dont les seuls encaissements du mois sont des acomptes de séjour reçoit, le 1er du
mois, l'avis que son relevé de gérance est disponible, comme celui qui a des loyers.

## Contexte

Réf : **P177.04** du fichier de pistes, `retenu · autonome` (A1 : le docblock de
`SendOwnerStatements` et TCK-594 partie 6 écrivent « chaque bailleur qui a eu des encaissements le
mois précédent », et `PayoutCalculator::bookingPayments` compte déjà les acomptes de séjour dans
le relevé).

## Hypothèses (mode sans humain)

- Les couples (agence, bailleur) des séjours se lisent comme `PayoutCalculator::bookingPayments` :
  `bookings.agency_id`, `properties.user_id`, pièces `paid` des types `BOOKING_TYPES`, `paid_at`
  dans la période. Le filtre `OwnerProfile` et l'idempotence par cache restent ceux des loyers.
- Un couple présent des deux côtés n'est avisé qu'une fois (le cache le garantit déjà).

## Delta à produire

- [x] `SendOwnerStatements::handle()` unit aux couples des loyers ceux des acomptes de séjour.
- [x] Garde dans `tests/Feature/Api/OwnerStatementTest.php`.

## Critères d'acceptation

- [x] AC1 — Bailleur sans bail, acompte `advance` de 50 000 payé le 10 septembre :
  `payouts:send-owner-statements --period=2026-09` lui envoie un avis, un seul après deux exécutions.

## Hors périmètre

- Les montants du relevé (P177.01 à P177.03, au porteur) et sa conservation (P177.05).

## Notes d'implémentation

- Reproduit avant correctif sur `663fc2871` : le test AC1 rend « sent 0 times ».
- Ablation : commande remise à son état antérieur → 1 rouge sur 1 (0 avis) ; rétablie → vert.
