---
id: TCK-2286
title: "Le bailleur ne fixe plus le taux de gestion du bail, et un paiement de réservation en attente ne porte pas de date d'encaissement"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-227--requêtes-de-création-plus-larges-que-les-gestes-et-les-modifications-resserrés"
  adr:
    - "docs/adr/0049-attribution-des-transactions-et-grand-livre-des-commissions.md"
tags: [api, baux, commissions, reversements, réservations, paiements, pistes]
---

## Objectif

Deux termes que la création acceptait plus largement que le geste : le taux de gestion d'un bail,
que le bailleur fixait, et la date d'encaissement d'un paiement de réservation en attente.

## Contexte

Réfs : **P227.01** et **P227.04** du fichier de pistes, `validé`.

- **P227.01** : `LeaseService::COMMISSION_TERMS` ne comptait que `commission_amount` et `agent_id`.
  Le bailleur créait son bail, puis le renouvelait, au taux 0 (201). Or pour une location ce taux est
  celui que le reversement retient (`PayoutCalculator`, celui du bail avant celui de l'agence).
- **P227.04** : `POST /api/bookings/{id}/payments` gardait le `paid_at` envoyé pour une ligne
  `pending` (201, ligne datée du 2026-01-01). La passerelle écrit `paid_at ??= now()`
  (`PaymentGatewayService`) : la date fausse survivait au règlement.

## Décision du porteur

- P227.01 : validé — validation du porteur (2026-10-25) : `commission_rate` rejoint `LeaseService::COMMISSION_TERMS` (ADR-0049 § 1), gardé à la création et au renouvellement
- P227.04 : validé — validation du porteur (2026-10-25) : 422 pour un paiement `pending` accompagné de `paid_at` (`prohibited_unless:status,paid`), comme TCK-681

## Delta à produire

- [x] `LeaseService::COMMISSION_TERMS` : `+ commission_rate`.
- [x] `LeaseRenewalController::store` : `assertMaySetCommissionTerms` sur les données du
  renouvellement, contre l'agence du bail.
- [x] `StoreBookingPaymentRequest` : `paid_at` interdit quand `status` vaut `pending`.
- [x] ADR-0049, amendement du 2026-10-25, et sa ligne de `docs/adr/README.md`.
- [x] `CommissionLedgerTest` (B1 étendu au taux), `BookingPaymentManualStatusTest`.

## Critères d'acceptation

- [x] AC1 — le bailleur qui envoie `commission_rate` à la création d'une location ou d'une vente
  reçoit 403 `lease.commission_forbidden`, et aucun bail n'est créé. Sans taux, sa vente naît sans
  commission.
- [x] AC2 — le bailleur qui envoie `commission_rate` au renouvellement reçoit 403, et aucun enfant ne
  naît. Sans taux, il renouvelle (201), et l'enfant garde le taux du parent.
- [x] AC3 — témoin : l'admin d'agence fixe le taux à la création (10) et au renouvellement (7).
- [x] AC4 — `pending` + `paid_at` → 422 sur `paid_at`, aucune ligne.
- [x] AC5 — témoin : `paid` + `paid_at`, et `paid_at` sans `status` (la ligne naît `paid`), gardent
  la date saisie (201).

## Hypothèses

- P227.04 : la règle posée est `prohibited_if:status,pending`, et non `prohibited_unless:status,paid`
  tel que l'écrit la parenthèse. Les deux ne diffèrent que sans `status` : la ligne naît alors `paid`
  (`BookingPaymentService::write`), et `prohibited_unless` aurait refusé sa date d'encaissement, un
  appel qui n'est pas « un paiement `pending` accompagné de `paid_at` ». C'est l'option qui ne retire
  rien à un appelant légitime. Mesuré : avec `prohibited_unless`, le témoin AC5 rougit.
- P227.04 : `receipt_number` reste posé sur toute ligne (option a de la re-vérification) ; le PDF de
  reçu exige déjà `paid`.
- P227.01 : le renouvellement se juge contre `leases.agency_id` du parent, comme le `PATCH` du bail.

## Notes d'implémentation

- Avant correctif : 3 rouges dans `CommissionLedgerTest` (vente, création, renouvellement : 201 au
  lieu de 403), 1 dans `BookingPaymentManualStatusTest` (201 au lieu de 422). Les témoins étaient verts.
- Ablations : `commission_rate` retiré de `COMMISSION_TERMS` → les 3 rouges reviennent (le
  renouvellement lit la même liste) ; la ligne de `LeaseRenewalController` neutralisée → le seul test
  du renouvellement rougit ; `prohibited_if` retiré → AC4 rougit. Remis : tout vert.
- `test_b1_a_sale_created_by_the_landlord_derives_no_commission` change de sens : le bailleur n'envoie
  plus de taux (403). Il garde son objet, une vente du bailleur sans commission, par l'appel sans taux.
