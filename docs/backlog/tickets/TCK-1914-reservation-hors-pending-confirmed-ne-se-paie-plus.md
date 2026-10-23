---
id: TCK-1914
title: "Le client ne paie plus une réservation annulée, refusée, expirée ou terminée : refus à la création de la ligne et à l'initiation en ligne"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-170--montants-envoyés-par-le-navigateur-et-pris-tels-quels-par-lapi"
tags: [api, bookings, payments, pistes]
---

## Contexte

Réf : **P170.01** du fichier de pistes, `validé` (V1 accordé). `BookingPaymentController::store`
dérive le montant du client (TCK-1309) sans lire `bookings.status`, et
`PaymentGatewayService::isPayable` ne juge que la ligne : sur une réservation `cancelled`,
`rejected` ou `expired`, le client ouvrait une ligne `pending` payable en ligne. La règle
« pending ou confirmed » n'existait qu'au navigateur (`BookingDetail.tsx`).

## Décision du porteur

validation du porteur (2026-10-23) : le client ne paie que sur une réservation `pending` ou `confirmed` (création et `isPayable()`), 422 codé sinon ; le personnel enregistre aussi sur `completed`

## Hypothèses (mode sans humain)

- « Le personnel enregistre aussi sur `completed` » décrit la saisie du personnel, que traite
  P170.02 (TCK-1916, « mêmes statuts de réservation que P170.01 ») ; ce ticket ne touche que le
  client et la passerelle.
- `isPayable()` refuse aussi une ligne d'une réservation `completed` : l'initiation en ligne est le
  geste du client, borné à `pending` et `confirmed` par la décision.

## Delta à produire

- [x] `Booking::CUSTOMER_PAYABLE_STATUSES` et `Booking::isPayableByCustomer()`.
- [x] `BookingPaymentController::store` : client hors de ces statuts → 422 `booking_payment.booking_not_payable` (fr, en ; wo = fr).
- [x] `PaymentGatewayService::isPayable` : une `BookingPayment` d'une réservation hors de ces statuts n'est pas payable.
- [x] Test `BookingPaymentBookingStatusTest`.

## Critères d'acceptation

- [x] AC1 — Le client qui poste un paiement sur une réservation `cancelled`, `rejected`, `expired` ou `completed` reçoit 422 `booking_payment.booking_not_payable`, et aucune ligne n'est écrite.
- [x] AC2 — Sur une réservation `pending` ou `confirmed`, il reçoit 201 avec l'acompte dérivé.
- [x] AC3 — `isPayable()` rend faux pour une ligne `pending` d'une réservation hors `pending`/`confirmed`, vrai sinon.

## Hors périmètre

- Les statuts où le personnel enregistre un paiement, et la borne de son montant : P170.02 (TCK-1916).

## Notes d'implémentation

- Ablation : contrôleur et passerelle remis à leur état d'avant → 8 rouges sur 12 (201 au lieu de 422, `isPayable` vrai) ; correctif remis → 12 verts.
