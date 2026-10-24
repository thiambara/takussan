---
id: TCK-2241
title: "L'historique des paiements ne rend plus à l'auteur suspendu ou retiré les acomptes des réservations qu'il a créées"
status: done
phase: P2
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
  models:
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-233--colonnes-dauteur-du-personnel-restées-hors-de-la-règle-dauteur-dadr-0031"
tags: [api, autorisation, payments, bookings, pistes]
---

## Objectif

Dans `GET /api/payments/history`, la branche des acomptes « auteur de la réservation »
(`bookings.created_by_id`) ne vaut plus que si la réservation est sans agence ou d'une agence dont
l'appelant est encore membre.

## Contexte

Réf : **P233.01** du fichier de pistes, `retenu · autonome` (A1).

- `PaymentController::history` listait `whereHas('booking', … created_by_id = user)` sans juger
  l'appartenance. Depuis TCK-2196, `BookingPolicy::view` (`auteurEncoreMembre`) et
  `BookingController::index` (`memberAgencyIds`) refusent la réservation à l'auteur suspendu ou
  retiré. L'historique lui en rendait encore les acomptes.
- ADR-0031, amendement du 2026-10-24, partie B : la règle d'auteur vaut pour `created_by_id`, et sa
  forme SQL borne les listes.

## Hypothèses (mode sans humain)

- La forme SQL est celle de `BookingController::index` : `created_by_id` et (agence nulle, ou
  comprise dans `MembershipCapabilityResolver::memberAgencyIds`).
- Le client (branche `customer.user_id`), le bailleur du bien (`BailleurDuBien`) et le personnel
  actif (`staffAgencyId`) gardent leur branche, inchangée.

## Delta à produire

- [x] `PaymentController::history` : branche de l'auteur bornée par l'appartenance.
- [x] `AuteurDeLaReservationHistoriqueDesAcomptesTest`.

## Critères d'acceptation

- [x] AC1 — Auteur d'une réservation de l'agence suspendu, puis retiré : l'acompte est absent de
  `GET /api/payments/history`, et `BookingPolicy::view` refuse (prémisse vérifiée).
- [x] AC2 — Témoins : l'auteur actif, et l'auteur d'une réservation sans agence, gardent l'acompte ;
  le client et le bailleur du bien le gardent quand l'auteur est retiré.

## Hors périmètre

- Les branches du bailleur et du personnel, déjà bornées (TCK-1932, TCK-2181, TCK-587).

## Notes d'implémentation

- Avant correctif : 2 rouges sur 5 (acompte listé à l'auteur suspendu et à l'auteur retiré).
- Ablation (branche rendue à `created_by_id` seul) → 2 rouges sur 5 ; remise → 5 verts.
