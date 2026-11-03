---
id: TCK-1214
title: "Un remboursement partiel laisse la ligne `paid`, comptée à montant − remboursement par l'encaissé, la clôture et le reversement"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-76--effets-aval-dun-paiement-soldé-puis-passé-à-refunded"
tags: [back, paiements, reversements, pistes]
---

## Contexte

Réf : **P76.02** du fichier de pistes, `validé` (V1 accordé).

Un remboursement partiel, par webhook (`refund_amount` plafonné au montant) ou par le geste manuel
d'un acompte, passait le payable entier à `refunded`. Or tous les circuits d'argent filtrent
`status = paid` : l'encaissé (`CollectedPayments`), la clôture de la plateforme
(`PlatformPayoutService`) et `PayoutCalculator`. La part gardée sortait avec la part rendue :
loyer de 150 000 remboursé de 40 000 → les 110 000 n'allaient ni à l'agence ni au bailleur.

## Décision du porteur

> validé — (b) : seul un remboursement total passe la ligne à `refunded` ; un remboursement partiel la laisse `paid` avec son `refund_amount`, et l'encaissé, la clôture et `PayoutCalculator` (commission comprise) comptent `montant − refund_amount`, côté loyers comme côté acomptes, ce qui étend aux loyers la définition d'ADR-0057 § 2 sans la réécrire ; amendement d'ADR-0057 § 2 accordé pour écrire la règle côté loyers ; garde : les deux scénarios en test sur chacun des trois lecteurs (porteur, 2026-10-22)

## Objectif utilisateur

Ce qu'un remboursement partiel laisse à l'agence et au bailleur leur reste compté et reversé.

## Delta à produire

- [x] `PaymentGatewayService::applyRefund()` : les deux chemins du webhook (dans l'ordre, et le
      remboursement reçu avant le paiement) écrivent `refund_amount` et ne passent à `refunded`
      qu'un remboursement égal au montant.
- [x] `BookingPaymentService::refund()` : le remboursement s'ajoute au précédent, plafonné au
      montant ; `refunded` seulement au total.
- [x] `CollectedPayments::LEASE_NET_SQL`, lu par `PortfolioMetrics::leaseIncomeByMonth()` et
      `PlatformMetricsSnapshotter::flowsBetween()` (frais compris).
- [x] Clôture de la plateforme : brut et commission sur `montant − refund_amount`, `breakdown()`
      de même.
- [x] `PayoutCalculator::compute()` : ligne et commission sur `montant − refund_amount`.
- [x] Les gardes de P76.01 et P76.03 (`items_changed`) voient aussi un remboursement partiel
      arrivé après la clôture ou la préparation : la ligne reste `paid`, seul le brut relu le
      montre.
- [x] `paid_amount` d'une ligne `paid` soustrait son `refund_amount`, comme pour `refunded` : les
      montants affichés d'un remboursement partiel ne changent pas.
- [x] `BookingRefundTaskService::closeIfSettled()` : un acompte remboursé en partie est traité, la
      tâche se clôt comme avant.

## Critères d'acceptation

- [x] AC1 — loyer de 150 000 soldé par la plateforme, remboursé de 40 000 par webhook → `paid`,
      `refund_amount = 40000`, `paid_amount = 110000` ; remboursé de 150 000 → `refunded`.
- [x] AC2 — acompte de 50 000, geste manuel de 20 000 → `paid` ; un second de 30 001 → 422
      `booking_payment.refund_exceeds_paid` ; de 30 000 → `refunded`, `refund_amount = 50000`.
- [x] AC3 (encaissé) — 110 000 pour le loyer, 30 000 pour l'acompte.
- [x] AC4 (clôture) — brut 110 000 pour le loyer, 30 000 pour l'acompte ; un remboursement partiel
      après la clôture → `approve` 422 `platform_payout.items_changed`.
- [x] AC5 (`PayoutCalculator`) — loyer : ligne 110 000, commission 11 000 à 10 % ; acompte : ligne
      30 000, commission 3 000 ; un remboursement partiel après la préparation → `mark-processed`
      422 `payout.items_changed`.

## Reste à faire

- L'amendement d'ADR-0057 § 2 qui écrit la règle côté loyers : accordé par le porteur, mais
  `docs/adr/` est fermé à l'implémenteur. Le docblock de `CollectedPayments` la porte.

## Hors périmètre

- Les lignes déjà passées à `refunded` par un remboursement partiel avant ce ticket : aucune
  réécriture de données (V4).
- Un second remboursement partiel par webhook de la même transaction : l'événement est dédupliqué
  par (fournisseur, transaction, type) (`isAlreadyProcessed`) et ne s'applique pas, comme avant.
- `docs/models-spec.md` § 15 (`refund_amount` d'une échéance « refunded ») : à compléter par
  `/sync-specs` (une ligne `paid` peut désormais porter un `refund_amount`).

## Notes d'implémentation

- Hypothèse : le montant d'un événement de remboursement est celui de ce remboursement, non un
  cumul ; il reste plafonné au montant du payable (`reportedRefundAmount`).
- Piège : sous l'option (b), un remboursement partiel postérieur à la clôture laisse la ligne
  `paid`, et les gardes de P76.01 / P76.03, qui ne lisaient que le statut, l'auraient laissé
  verser. Elles relisent le brut (`montant − refund_amount`, plus la pénalité figée côté
  plateforme) seulement quand une ligne porte un remboursement.
- Ablation : `app/` rendu à `5f8519e71` → 9 rouges sur 11 (les deux verts : le témoin du
  remboursement total, et la garde de clôture que l'ancien statut `refunded` déclenchait) ; la
  seule relecture du brut retirée de `PlatformPayoutService` → la garde de clôture rougit ; remis
  → 11/11.
