---
id: TCK-1309
title: "Paiement de réservation : l'API dérive le montant payé par le client"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-133--estimations-et-aperçus-calculés-au-front-face-au-calcul-de-lapi"
tags: [api, front, booking, payments, pistes]
---

## Contexte

Réf : **P133.05** du fichier de pistes, `validé` par le porteur. Entrée dans le lot de l'angle 115
par la famille : elle cite `BookingDetail.tsx`, que TCK-1301 touche.

`CustomerPayCta` calcule le reste à payer et poste ce montant ; l'API valide `amount` en
`numeric|min:0` et l'écrit tel quel, puis la passerelle encaisse le montant de la ligne. Mesuré :
le client poste `amount = 1` puis `999 999 999` en `deposit` → 201 les deux fois.

## Décision du porteur

porteur (2026-10-22) : l'API dérive le montant d'un paiement de réservation ; le navigateur ne l'envoie plus

## Objectif

Le client d'une réservation paie l'acompte, puis le reste dû, au montant que fixe l'API.

## Delta à produire

- [x] `BookingPaymentService::dueFromCustomer()` : acompte tant qu'aucune ligne n'est `paid` (s'il y
      a un acompte), sinon reste dû = total − lignes `paid` ; 422 `booking_payment.nothing_due` si
      rien n'est dû (libellé fr/en, wo en français).
- [x] `BookingPaymentController::store` : pour le client non encaisseur, `amount` et `payment_type`
      dérivés, ce qu'il envoie est ignoré.
- [x] `StoreBookingPaymentRequest` : `amount` et `payment_type` requis du seul personnel
      (`payeurClient()`, la règle que le contrôleur appliquait déjà).
- [x] Front : « Payer l'acompte » / « Payer le solde » postent `{ status: 'pending' }`.
- [x] Tests : `BookingPaymentAmountDerivedTest`, `BookingDetail.montant-derive.tck-1309.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Réservation à 100 000, acompte 30 000 : le client sans montant → ligne de 30 000
      `deposit` `pending` ; avec `amount = 1` ou `999 999 999` → 30 000.
- [x] AC2 — Acompte payé : → 70 000 `advance`. Sans acompte : → 100 000 `advance`.
- [x] AC3 — Réservation soldée : → 422 `booking_payment.nothing_due`.
- [x] AC4 — Le personnel sans montant → 422 de validation ; avec 5 000 → 5 000.
- [x] AC5 — Le front n'envoie plus de montant.

## Hors périmètre

- Les lignes `partially_paid` et `refunded` : la règle du navigateur est déplacée telle quelle (elle
  ne compte que les lignes `paid`). Ce qu'elles devraient peser dans le reste dû est un autre choix.
- Refuser par 422 un montant envoyé par le client : la décision dit que le navigateur ne l'envoie
  plus ; un montant envoyé est ignoré, comme le statut l'est déjà (TCK-172).

## Notes d'implémentation

- Ablation API : dérivation retirée du contrôleur → 5 rouges sur 6 ; remise → vert.
  `BookingPaymentTest`, `BookingPaymentRefundAuthorizationTest`, `AvisEtEncaissementFieldLengthTest`
  verts.
- Ablation front : avant correctif, 2 rouges (`amount` 30 000 / 70 000 dans la charge utile).
