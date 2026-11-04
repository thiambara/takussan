---
id: TCK-2152
title: "À la fermeture d'une réservation, ses lignes de paiement en attente sont annulées"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-200--gestes-dargent-sur-un-dossier-clos--réservation-fermée-facture-dun-objet-clos"
tags: [api, bookings, payments, payouts, pistes]
---

## Contexte

Réf : **P200.01** du fichier de pistes, `validé` par le porteur (critère V1 accordé). `cancel`,
`reject` et `expire` fermaient la réservation sans toucher à ses lignes de paiement : un checkout
ouvert avant la fermeture et confirmé après écrivait la ligne `paid`, sans tâche de remboursement
(`openFor` ne court qu'à la fermeture), et `PayoutCalculator::bookingPayments` la rendait au
reversement du bailleur.

## Décision du porteur

> validé — validation du porteur (2026-10-24) : à la fermeture d'une réservation (les trois chemins), sous son verrou, ses lignes `pending` passent `cancelled` ; un succès tardif prend le chemin du doublon (`gateway_duplicate_payment`, avis `payment.duplicate` aux admins d'agence) et n'entre jamais au reversement

## Objectif

Un encaissement en ligne confirmé après la fermeture d'une réservation est traité en doublon à
rembourser, jamais en paiement reversable.

## Hypothèses (mode sans humain)

- Seules les lignes `pending` sont annulées, comme le dit la décision : `failed`, `late` et
  `partially_paid` restent telles quelles.
- L'annulation se fait ligne à ligne (`update` du modèle), pour que la matrice de transitions
  (`pending → cancelled` permis) et le journal d'audit s'appliquent.

## Delta à produire

- [x] `Booking::cancelPendingPayments()`, sous le verrou de la réservation, lignes relues `FOR UPDATE`.
- [x] Appel dans les transactions de `BookingService::cancel`, `::reject` et `BookingExpirationService::expire`.
- [x] `tests/Feature/Booking/ClosedBookingPendingPaymentTest.php`.

## Critères d'acceptation

- [x] AC1 — Annulation, refus et expiration passent la ligne `pending` à `cancelled`.
- [x] AC2 — Le webhook de succès qui suit laisse la ligne `cancelled`, sans `paid_at`, l'inscrit dans `gateway_duplicate_payment` et prévient l'admin d'agence (`payment.duplicate`).
- [x] AC3 — `PayoutCalculator::bookingPayments` ne rend pas la ligne.
- [x] AC4 — Témoins : une réservation ouverte solde toujours sa ligne ; une ligne déjà `paid` n'est pas touchée par la fermeture.

## Hors périmètre

- `isPayable()` qui ne juge pas le statut de la réservation (P170.01).

## Notes d'implémentation

- Ablation : `cancelPendingPayments()` vidé → 3 rouges (les trois fermetures, ligne restée `pending`), témoins verts ; remis → 5 verts.
- Le chemin du doublon existait déjà pour une ligne `cancelled` (VERIF-596 passe 5) : aucun code de webhook neuf.
