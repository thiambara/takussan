---
id: TCK-1825
title: "« Enregistrer un paiement reçu » ne propose plus une restitution de caution"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-183--statuts-recalculés-par-le-navigateur-à-partir-des-dates"
tags: [front, leases, payments, pistes]
---

## Contexte

Réf : **P183.03** du fichier de pistes, `retenu · autonome` (A1).

`LeasePaymentDialog` proposait toutes les échéances `pending` ou `late` du bail, sans regarder
`payment_type`. La liste des échéances rend aussi les restitutions de caution (`deposit_refund`),
que `LeasePaymentService::markPaid` refuse toujours en 422
(`lease_payment.deposit_refund_paid_by_payout`, TCK-594) : elles se règlent par leur reversement.
Une restitution en attente apparaissait donc comme un loyer, et son enregistrement échouait ; seule
en attente, elle empêchait le dialogue de dire qu'il n'y avait rien à régler.

## Delta à produire

- [x] `LeasePaymentDialog` : les options écartent `payment_type === 'deposit_refund'`, comme
      `isPayable` l'écarte du paiement en ligne (`PaymentGatewayService`).
- [x] `LeasePaymentDialog.test.tsx` : deux tests (restitution écartée des options ; restitution
      seule → « Aucune échéance en attente sur ce bail. », envoi désactivé).

## Critères d'acceptation

- [x] AC1 — Un bail avec un loyer `pending` et une restitution `pending` ne propose que le loyer.
- [x] AC2 — Un bail dont la seule échéance en attente est une restitution affiche qu'il n'y a rien
      à régler.

## Hors périmètre

- Le badge de retard de la fiche du bail, qui compte aussi les restitutions (P183.02, au porteur).

## Notes d'implémentation

- Ablation : filtre retiré → les deux tests neufs rougissent (option « 1 juin 2026 → 30 juin 2026 »
  en trop ; message absent) ; remis → 5/5.
