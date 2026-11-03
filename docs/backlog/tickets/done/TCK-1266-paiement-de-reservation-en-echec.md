---
id: TCK-1266
title: "Un paiement de réservation en échec se lit « Échec », sur le ton du danger"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-146--unions-de-statut-et-options-de-filtre-du-front-face-aux-enums-de-lapi"
tags: [front, bookings, i18n, pistes]
---

## Contexte

Réf : **P146.01** du fichier de pistes, `retenu · autonome` (A4, A1). Entrée dans le lot par
l'angle 146, avec P146.02 (TCK-1264).

L'échec d'un paiement en ligne écrit `failed` sur un `BookingPayment`. Le front type
`BookingPaymentStatus` sans `failed` ni `late` ; la table des libellés de `BookingDetail`, la
table des tons et le dictionnaire `bookings.paymentStatus` non plus : le badge rend `failed` brut,
sur le ton neutre. Le type de charge propose `cancelled`, que `StoreBookingPaymentRequest` refuse.

## Objectif utilisateur

Le client et l'agence voient qu'un paiement d'acompte a échoué.

## Contrat de données

Aucun changement d'API. `BookingPaymentResource` rend `status` parmi les cas de `PaymentStatus`.

## Delta à produire

- [x] `BookingPaymentStatus` aligné sur les sept cas de `PaymentStatus`.
- [x] Libellés et tons : `failed` et `late` en `danger`, libellés repris de `payments.status`
  (« Échec », « En retard » ; `wo` = texte français).
- [x] `CreateBookingPaymentPayload.status` sans `cancelled`.
- [x] Test `BookingDetail.paiement-en-echec.tck-1266.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un paiement `failed` s'affiche « Échec », `data-tone="danger"`, sans la valeur brute.
- [x] AC2 — Idem pour `late` (« En retard »).
- [x] AC3 — `tsc` refuse une charge `status: 'cancelled'`.

## Hors périmètre

- Proposer `late` ou `failed` à la saisie d'un paiement (la Piste ne demande que le retrait de
  `cancelled`).
- La garde qui confronte les unions du front aux enums de l'API (P146.04, au porteur).

## Notes d'implémentation

- `late` est ajouté avec `failed` : la Piste aligne le type sur `PaymentStatus`, et le libellé
  « En retard » existe sous `payments.status`. Ton `danger` pour les deux, comme
  `PAYMENT_STATUS_TONE` (`components/payments/constants.ts`).
- Ablation : `BookingDetail.tsx`, `booking-status.ts` et `queries/bookings.ts` rendus à `HEAD`,
  traductions gardées → 2 rouges vitest (`failed`, `late` introuvables) et `tsc` en erreur
  (`Unused '@ts-expect-error'`) ; correctif remis → 4/4 verts, `tsc` propre.
