---
id: TCK-1916
title: "Un paiement de réservation saisi par le personnel est borné au reste dû, et refusé sur une réservation annulée, refusée ou expirée"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1914]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-170--montants-envoyés-par-le-navigateur-et-pris-tels-quels-par-lapi"
tags: [api, bookings, payments, payouts, pistes]
---

## Contexte

Réf : **P170.02** du fichier de pistes, `validé` (V1 accordé). Le personnel saisissait un paiement
de réservation `paid` de n'importe quel montant (`numeric|min:0`) : `999 999 999` en `advance` sur
une réservation de 100 000 → 201, et la ligne entrait au brut du prochain reversement du bailleur
(`PayoutCalculator::bookingPayments`). La même saisie passait sur une réservation `cancelled`.

## Décision du porteur

validation du porteur (2026-10-23) : borne = `total_amount` moins les lignes `paid`, pour `deposit` et `advance` seulement (`fee` hors du total reversable, ADR-0039 § 3), 422 codé au-delà ; mêmes statuts de réservation que P170.01 ; pas de notion de trop-perçu

## Hypothèses (mode sans humain)

- « Mêmes statuts que P170.01 » pour le personnel : `pending`, `confirmed`, et `completed` que la
  décision de P170.01 lui ajoute ; `cancelled`, `rejected`, `expired` → 422 `booking_payment.booking_not_payable` (code de TCK-1914).
- « Les lignes `paid` » déduites sont celles d'acompte et de solde : une ligne de frais n'est pas
  dans le total reversable, elle n'en est ni bornée ni déduite.
- La borne vaut quel que soit le statut de la ligne saisie (`paid` ou `pending`) ; seules les lignes
  `paid` existantes la réduisent.

## Delta à produire

- [x] `Booking::STAFF_PAYABLE_STATUSES`, `Booking::acceptsStaffPayment()`.
- [x] `BookingPaymentController::store` : statut refusé au personnel → 422 `booking_payment.booking_not_payable`.
- [x] `BookingPaymentService::create(…, boundedByRemaining)` et `remainingReversable()` : réservation verrouillée, 422 `booking_payment.exceeds_remaining` (`:remaining`) au-delà (fr, en ; wo = fr).
- [x] Test `BookingPaymentStaffBoundTest`.

## Critères d'acceptation

- [x] AC1 — Agent, réservation `confirmed` à 100 000 : `999 999 999` en `advance` → 422 `booking_payment.exceeds_remaining`, aucune ligne.
- [x] AC2 — Après un acompte `paid` de 30 000 : 70 001 → 422, 70 000 → 201, puis 1 en `deposit` → 422.
- [x] AC3 — Une ligne `pending` existante ne réduit pas la borne ; une ligne `fee` n'est ni bornée ni déduite.
- [x] AC4 — Réservation `cancelled`, `rejected` ou `expired` → 422 `booking_payment.booking_not_payable` ; `pending`, `confirmed`, `completed` → 201.

## Hors périmètre

- Une notion de trop-perçu (écartée par la décision).
- La borne au navigateur (`BookingPaymentDialog`, `positive()` seul) : l'API rend le code, le dialogue affiche son message.
- Le statut `partially_paid` : P170.03 (TCK-1918).

## Notes d'implémentation

- Ablation : borne et refus de statut retirés du contrôleur → 5 rouges sur 10 ; remis → 10 verts.
- La borne se juge sous `lockForUpdate` de la réservation : deux saisies concurrentes ne passent pas toutes deux.
