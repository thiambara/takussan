---
id: TCK-1932
title: "L'agent créateur d'un bien, suspendu ou retiré, n'ouvre ni ne vérifie plus le paiement en ligne des acomptes, et ne les lit plus dans l'historique"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1928]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, payments, bookings, authorization, pistes]
---

## Contexte

Réf : **P190.03** du fichier de pistes, `validé` (V2 et V1 accordés). `BookingPaymentPolicy::update`,
qui garde `initiate`, `verify` et `providers` de la passerelle, acceptait
`booking.property.user_id === user.id` sans juger l'agence ni le statut, et
`PaymentController::history` listait les acomptes des biens dont l'appelant est `user_id` :
l'agent qui a saisi le bien, suspendu ou retiré, gardait la main sur ces acomptes.

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite ; le client de la réservation reste accepté

## Reste à faire

refuser l'initiation au bailleur bloqué (`landlordWrites`), qui demande une ability propre à `initiate` dans les trois policies de paiement (`verify` et `providers` partagent aujourd'hui l'ability `update`)

## Hypothèses (mode sans humain)

- Une seule ability (`update`) garde les trois routes de la passerelle, pour trois modèles de
  paiement. Y faire juger `landlordWrites` retirerait aussi la vérification et les fournisseurs au
  bailleur bloqué, qui garde la lecture (ADR-0031 § 2). La branche du bien passe donc par
  `BailleurDuBien::est` seul, et l'initiation refusée au bailleur bloqué reste à faire.

## Delta à produire

- [x] `BookingPaymentPolicy::update` : branche du bien par `BailleurDuBien::est`.
- [x] `PaymentController::history` : clause du bien par `BailleurDuBien::restreindre` (TCK-1928).
- [x] Test `AgentCreateurPaiementDesAcomptesTest`.

## Critères d'acceptation

- [x] AC1 — Agent créateur suspendu, puis retiré : `can('update')` faux, `providers` et `verify` en 403, acompte absent de `GET /api/payments/history`.
- [x] AC2 — Le client de la réservation : `can('update')` vrai, `providers` 200, acompte dans son historique.
- [x] AC3 — Le bailleur du bien, bloqué compris : `can('update')` vrai et acompte dans son historique, comme avant.

## Hors périmètre

- Voir « Reste à faire ».

## Notes d'implémentation

- Ablation : politique et contrôleur remis → 2 rouges sur 4 ; remis → 4 verts.
