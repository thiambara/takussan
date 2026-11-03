---
id: TCK-1432
title: "Supervision des paiements : « en retard » se lit par l'échéance dépassée, plus par le statut `late` que seule la pénalité écrit"
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
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-162--compteurs-et-sélecteurs--en-cours--écrits-par-une-liste-de-statuts-à-la-main"
tags: [api, payments, super-admin, pistes]
---

## Contexte

Réf : **P162.06** du fichier de pistes, `validé (délégué)` (critère accordé : V7).
`PaymentSupervisionService` compte « en retard » les échéances `lease_payments.status = late`.
Le seul écrivain de `late` est `LateFeeCalculator::apply`, qui ne fait rien sur un bail sans
pénalité : une échéance échue d'un tel bail reste `pending` et la console ne la voit jamais. Côté
réservations, la requête lit `booking_payments.status = late`, que rien n'écrit.

## Décision du porteur (déléguée)

> validé (délégué) — les loyers « en retard » de la supervision se lisent par `LeasePayment::overdue()`, l'échéance (`due_date`) dans la période ; pour les réservations, la requête `lateBookingPayments` est retirée (aucune échéance ni aucun écrivain de `late`), la colonne et le filtre « en retard » de la console restent ; reste : définir le retard d'une réservation, qui demanderait une colonne d'échéance

## Objectif

La console compte en retard toute échéance de loyer échue et impayée, pénalité ou non.

## Delta à produire

- [x] `lateLeasePayments` restreint aux lignes de `LeasePayment::query()->overdue()`, échéance dans la période.
- [x] `lateBookingPayments` retirée de la liste et des compteurs.
- [x] Docblock du service : la définition de « en retard ».

## Critères d'acceptation

- [x] AC1 — Une échéance `pending` échue de 3 jours d'un bail à `late_fee_percent = 0` est listée sous `filter[status]=late` et comptée dans les compteurs 7 et 30 jours.
- [x] AC2 — Une échéance non échue, ou échue hors de la fenêtre, ne compte pas.
- [x] AC3 — Un paiement de réservation, même `late`, n'est ni listé ni compté en retard.
- [x] AC4 — La console garde sa colonne et son filtre « en retard » (aucun changement du front).

## Hors périmètre

- La part des paiements « en échec », inchangée.

## Reste à faire

définir le retard d'une réservation, qui demanderait une colonne d'échéance

## Notes d'implémentation

- `overdue()` passe en sous-requête (`whereIn('lp.id', …)`) : ses colonnes non qualifiées
  (`status`, `due_date`) seraient ambiguës sur la jointure `lease_payments`/`leases`.
- Ablation : service remis à `bba57a9e0` → le test neuf rougit (`orange_money.late` 0 au lieu
  de 1) ; remis → vert.
