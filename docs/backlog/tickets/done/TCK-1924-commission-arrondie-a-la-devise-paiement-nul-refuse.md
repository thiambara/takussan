---
id: TCK-1924
title: "La commission d'un bail s'arrondit à la devise, et le personnel n'enregistre plus un paiement de réservation à 0"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-170--montants-envoyés-par-le-navigateur-et-pris-tels-quels-par-lapi"
tags: [api, leases, commissions, bookings, payments, pistes]
---

## Contexte

Réf : **P170.06** du fichier de pistes, `validé` (V1 accordé). Deux points :
la commission d'une vente dérivée « prix × taux » s'arrondissait à 2 décimales (`round(…, 2)`,
`LeaseService.php`) — 1 234 567 XOF à 2,5 % donnait 30 864,18 XOF, une sous-unité que XOF n'a pas
(ADR-0009) ; et le paiement de réservation saisi par le personnel admettait `0` (`min:0`), une ligne
`paid` à 0 avec un numéro de reçu.

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite ; arrondir aussi un `commission_amount` saisi

## Hypothèses (mode sans humain)

- « Saisi » couvre la création (`POST /api/leases`) et la modification d'un brouillon
  (`PATCH /api/leases/{id}`), les deux voies qui écrivent `commission_amount`.
- La devise est celle du bail (`currency` de la création, à défaut XOF ; à la modification, celle de la ligne).
- `gt:0` ne vaut que pour le personnel : le montant du client est ignoré (TCK-1309), sa règle ne change pas.

## Delta à produire

- [x] `LeaseService::roundCommission()` (`Currency::roundAmount`), lu par `LeaseService::create` (dérivée ou saisie) et par `LeaseController::update`.
- [x] `StoreBookingPaymentRequest` : `amount` `gt:0` pour le personnel.
- [x] Tests dans `CommissionLedgerTest` et `BookingPaymentStaffBoundTest`.

## Critères d'acceptation

- [x] AC1 — Vente à 1 234 567 XOF, taux 2,5 %, sans montant → `commission_amount` = 30 864,00.
- [x] AC2 — `commission_amount` saisi 1 000,4 XOF → 1 000,00 ; modifié à 999,6 → 1 000,00 ; 1 000,45 EUR → gardé.
- [x] AC3 — Le personnel qui saisit `amount: 0` reçoit 422 sur `amount`, aucune ligne.

## Hors périmètre

- Les commissions déjà en base (aucune réécriture de données).

## Notes d'implémentation

- Ablation : service, contrôleur et FormRequest remis → 2 rouges dans `CommissionLedgerTest`, 1 dans `BookingPaymentStaffBoundTest` ; remis → verts.
