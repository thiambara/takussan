---
id: TCK-1918
title: "Un paiement de réservation saisi à la main ne naît plus `partially_paid` : une part reçue est une ligne `paid` de son montant"
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
tags: [api, web, bookings, payments, pistes]
---

## Contexte

Réf : **P170.03** du fichier de pistes, `validé` (V1 accordé). Depuis TCK-1311, le personnel peut
poser `status: partially_paid` sur un paiement de réservation : la ligne naît sans `paid_at`,
`dueFromCustomer()` ne compte que les lignes `paid` et le reversement non plus. Le client se voyait
redemander l'acompte entier.

## Décision du porteur

retirer `partially_paid` des statuts que le personnel peut poser (revient sur TCK-1311) ; une part reçue est une ligne `paid` de son montant ; à lier à P04.11 pour un seul sens du partiel

## Hypothèses (mode sans humain)

- « À lier à P04.11 » : P04.11 est `fait · TCK-891 — reste : terminer ou retirer le paiement
  partiel`. Ce ticket ne retire pas le cas `PaymentStatus::PartiallyPaid` (des lignes existantes et
  les échéances de bail le lisent) ; il ferme la seule saisie manuelle de réservation, dans le sens
  « retirer » de ce reste.
- Le type `CreateBookingPaymentInput` du front suit le contrat ; les types de lecture gardent
  `partially_paid` (lignes existantes).

## Delta à produire

- [x] `StoreBookingPaymentRequest` : `status` ∈ {`paid`, `pending`}.
- [x] `takussan-web/src/lib/queries/bookings.ts` : `status?: 'pending' | 'paid'`.
- [x] `BookingPaymentManualStatusTest` mis à jour, et un cas « part reçue saisie `paid` ».

## Critères d'acceptation

- [x] AC1 — Le personnel qui pose `partially_paid` reçoit 422 sur `status`, aucune ligne écrite.
- [x] AC2 — `paid` et `pending` restent permis.
- [x] AC3 — Réservation à 100 000 (acompte 30 000) : une part de 10 000 saisie `paid` en `deposit`, puis le client paie 90 000.

## Hors périmètre

- Le retrait du cas `partially_paid` de l'enum et des échéances de bail (reste de P04.11).
- Les lignes `partially_paid` déjà en base (aucune réécriture de données).

## Notes d'implémentation

- Ablation : `PartiallyPaid` remis dans `only()` → 1 rouge sur 3 (201 au lieu de 422) ; retiré → 3 verts.
