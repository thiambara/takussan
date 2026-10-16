---
id: TCK-668
title: "La révision de loyer réécrit les échéances pending dont la période commence à sa date d'effet"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#15-leasepayment-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements
tags: [back, leases, payments, pistes]
---

## Contexte

Réf : **P04.02** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

`RentReviewService::review()` ne modifiait que `leases.monthly_rent`. L'échéancier est généré en
entier à l'activation et ne se régénère pas (`lease.schedule_exists`) : le locataire était notifié
du nouveau loyer, puis facturé à l'ancien jusqu'à la fin du bail.

## Décision du porteur

à effective_date, réécrire les échéances pending dont la période commence après, jamais une échéance payée ou en cours de paiement

## Objectif

Une révision de loyer porte le nouveau loyer sur les échéances de loyer encore dues à partir de sa
date d'effet.

## Delta à produire

- [x] `RentReviewService::rewriteUpcomingRentPayments()`, appelé sous le verrou du bail : les
      `LeasePayment` de type `rent`, `pending`, dont `period_start >= effective_date`, verrouillés,
      passent à `nouveau loyer × mois de leur période`.
- [x] Exclues : toute échéance non `pending` (payée, partiellement payée, en retard…), une
      `pending` dont un checkout est ouvert (`PaymentGatewayService::openCheckout()`, montant
      figé) ou qui porte un acompte (`metadata.paid_amount > 0`), toute échéance autre que de loyer.
- [x] Docblock de la classe corrigé (il décrivait un générateur qui lirait `effective_date`).
- [x] Tests : trois cas dans `RentReviewServiceTest`.

## Critères d'acceptation

- [x] AC1 — Trois échéances `pending` à 200 000 (mois avant, mois de, mois après la date d'effet),
      révision à 220 000 : la première reste à 200 000, les deux autres passent à 220 000.
- [x] AC2 — Une échéance `paid`, une `partially_paid`, une `pending` à checkout ouvert et une
      caution gardent leur montant.
- [x] AC3 — Une échéance dont la période couvre trois mois passe à 3 × le nouveau loyer.

## Hypothèses (mode sans humain)

- « dont la période commence après » inclut la période qui commence le jour même de la date
  d'effet : le nouveau loyer s'applique dès ce jour (`period_start >= effective_date`).
- « en cours de paiement » = checkout ouvert au sens de `openCheckout()` (celui que le 409
  `payment.checkout_in_progress` désigne), ou acompte déjà enregistré.
- Le montant d'une période de plusieurs mois suit la décision de P04.01 (loyer mensuel × mois de
  la période) ; sur une période d'un mois, c'est le nouveau loyer.
- La réécriture a lieu au moment de la révision (la date d'effet n'est jamais passée), et vise les
  échéances dont la période commence à la date d'effet ou après.

## Hors périmètre

- Une échéance dont le checkout a expiré est réécrite ; un webhook tardif de ce checkout serait
  jugé sur le montant figé à son initiation (`assertReportedAmountCoversPayment`), soit l'ancien
  loyer. Non traité ici.
- Le cas d'une échéance `pending` portant un acompte n'a pas de test dédié (le cas
  `partially_paid` le couvre par le statut).

## Notes d'implémentation

- Rouge avant correctif : AC1 et AC3 (montants inchangés) ; AC2 vert d'emblée (il garde la borne).
- Ablation : appel retiré → AC1 et AC3 rouges ; garde checkout/acompte retirée → AC2 rouge
  (checkout ouvert réécrit) ; filtres statut et type retirés → AC2 rouge ; multiplication par les
  mois retirée → AC3 rouge. Remis → 11 verts.
- `period_start` est une colonne `date` : `where`, pas `whereDate` (P02.06).
