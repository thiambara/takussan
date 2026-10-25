---
id: TCK-2154
title: "L'acompte d'une réservation close à rembourser reste hors du reversement au bailleur"
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
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#28-payout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-200--gestes-dargent-sur-un-dossier-clos--réservation-fermée-facture-dun-objet-clos"
tags: [api, payouts, bookings, pistes]
---

## Contexte

Réf : **P200.02** du fichier de pistes, `validé` par le porteur (critère V1 accordé).
`PayoutCalculator::bookingPayments()` ne lisait ni le statut de la réservation ni sa tâche
`booking_refund` : l'acompte encaissé d'une réservation annulée, que la tâche signale « à
rembourser », était proposé au reversement du bailleur.

## Décision du porteur

> validé — validation du porteur (2026-10-24) : `bookingPayments()` écarte les pièces d'une réservation `cancelled`, `rejected` ou `expired` tant que sa tâche `booking_refund` est ouverte ; le geste « remboursé » ou la clôture de la tâche les libère, le reste non remboursé redevenant reversable ; le préparatif le signale

## Objectif

Un acompte à rendre au client n'est ni proposé ni accepté dans un reversement au bailleur tant que
son remboursement n'est pas traité.

## Hypothèses (mode sans humain)

- « Tâche ouverte » : la tâche `booking_refund` de la réservation existe, n'est ni `done` ni
  `cancelled`, ni supprimée.
- « Le geste remboursé libère » se lit pièce à pièce : une pièce dont `refund_amount > 0` (partiel)
  est libérée, comptée à `montant − refund_amount` comme déjà (TCK-1214) ; un remboursement total
  la passe `refunded`, déjà hors du calcul.
- Une pièce déjà reversée n'est pas retenue : le relevé de gérance (`onlyUnpaidOut = false`) la
  garde ; une pièce retenue non reversée sort du relevé comme de la préparation, puisque c'est
  `bookingPayments()` qui l'écarte.
- La création (`PayoutService::create`) refuse une pièce retenue citée directement (422 sur
  `booking_payment_ids`, `money_out.payout.ineligible_item`), avant la transaction puis sous le
  verrou des réservations, comme le statut `paid`.
- « Le préparatif le signale » : la réponse de `GET /api/payouts/preparation` porte une clé
  additive `held_for_refund` (id, réservation, référence, montant, `paid_at`).

## Delta à produire

- [x] `PayoutCalculator` : `whereHeldForRefund`, `bookingPaymentsHeldForRefund`, `heldForRefundAmong` ; `bookingPayments()` les écarte.
- [x] `PayoutPreparationService::prepare` : `held_for_refund`.
- [x] `PayoutService` : `assertNotHeldForRefund` dans `assertItemsInScope` et `createLocked`.
- [x] `tests/Feature/Payout/HeldForRefundBookingPaymentTest.php`.

## Critères d'acceptation

- [x] AC1 — Réservation annulée, tâche ouverte : l'acompte sort de `bookingPayments()` et des lignes de la préparation, figure dans `held_for_refund`, et la création qui le cite est refusée sans rien écrire.
- [x] AC2 — De même pour une réservation `rejected` ou `expired`.
- [x] AC3 — Un remboursement partiel libère sa pièce seule, comptée au reste gardé ; l'autre pièce, tâche ouverte, reste retenue.
- [x] AC4 — La clôture de la tâche libère l'acompte.
- [x] AC5 — Témoin : l'acompte d'une réservation ouverte reste reversable.

## Hors périmètre

- L'affichage de `held_for_refund` à l'écran de préparation du front.
- Un acompte reversé avant la fermeture puis remboursé (angle 205, P205.01).

## Notes d'implémentation

- Ablation : `whereHeldForRefund` réduit à `false` → 3 rouges (AC1, AC2, AC3), remis → 6 verts.
- Le remboursement partiel d'un acompte seul clôt la tâche (`closeIfSettled`) : d'où le cas à deux pièces, qui seul prouve la libération par le geste.
