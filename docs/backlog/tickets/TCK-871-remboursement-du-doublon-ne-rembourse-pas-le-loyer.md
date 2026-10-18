---
id: TCK-871
title: "Le remboursement d'un double encaissement ne passe plus le payable à `refunded`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-39--webhooks-de-paiement-refund-et-failed-sur-un-paiement-déjà-soldé"
tags: [back, payments, webhooks, pistes]
---

## Contexte

Réf : **P39.01** du fichier de pistes, `validé` par le porteur (critère accordé : V1). La branche
`REFUNDED` d'`PaymentGatewayService::applyStatusToPayment` passait à `refunded` tout payable `paid`
qu'apparie la transaction. Or la branche `SUCCESS` marque un second encaissement comme double
encaissement et prévient l'agence « pour rembourser » : rembourser ce doublon remboursait le loyer
réglé par une autre transaction, ou en espèces.

## Décision du porteur

la branche `REFUNDED` ne passe à `refunded` que si `isSettledBy($existingMeta, $transactionId)` ; sinon le remboursement est noté (`refunded_at`) sur l'entrée `gateway_duplicate_payment` de la transaction ; tests : les deux scénarios mesurés et le témoin

## Objectif utilisateur

L'agence qui rembourse le double encaissement qu'on lui a signalé garde son loyer encaissé.

## Contrat de données

Aucun endpoint neuf. L'entrée `metadata.gateway_duplicate_payment[]` de la transaction remboursée
reçoit `refunded_at` (instant ISO 8601).

## Contraintes strictes (métier)

- Le remboursement de la transaction qui a soldé le payable le passe toujours à `refunded`.
- Le remboursement d'une transaction marquée doublon ne change ni le statut, ni `settled_by`, ni
  `paid_amount`.

## Delta à produire

- [x] `PaymentGatewayService` : branche `REFUNDED` gardée par `isSettledBy` et par
  `isMarkedDuplicate` ; `markDuplicateRefunded` note `refunded_at`.
- [x] Test : `tests/Feature/Api/PaymentWebhookRefundTest.php` (second checkout, checkout payé après
  des espèces, témoin).

## Critères d'acceptation

- [x] AC1 — Deux checkouts payés sur une échéance, remboursement du second : l'échéance reste `paid`,
  `settled_by = spy_txn_1`, `paid_amount = 150000`, l'entrée du doublon porte `refunded_at`.
- [x] AC2 — Espèces puis checkout payé, remboursement du checkout : l'échéance reste `paid`,
  `settled_by = manual`, l'entrée du doublon porte `refunded_at`.
- [x] AC3 — Témoin : remboursement de la transaction qui a soldé → `refunded`.

## Hypothèses

- `isSettledBy` reconnaît aussi un règlement par l'événement `paid` journalisé de la transaction
  (repli d'avant `settled_by`). Le doublon a, lui aussi, son `paid` journalisé : la condition
  écarte donc en plus une transaction marquée doublon (hors part de pénalité, `kind = late_fee`,
  qui porte la transaction qui a soldé le loyer).
- Un remboursement sur une transaction ni soldante ni marquée doublon n'écrit rien de plus que
  l'événement dans `gateway_events`.

## Hors périmètre

- `refund_amount` et la tâche de remboursement d'acompte (P39.03, TCK-873).
- Le nom réel des événements de remboursement des fournisseurs (P39.05).

## Notes d'implémentation

- Piège : `isSettledBy` seul ne suffit pas (premier essai resté rouge sur AC1 et AC2) : son repli
  sur `gateway_events` trouve le `paid` du doublon, journalisé par `markAsProcessed`.
- Le test applique le remboursement par `applyEventToMatchingPayment()` sous l'autorité de
  l'intégration, et non par un nom d'événement Wave deviné (P39.05).
- Ablation : `PaymentGatewayService.php` remis à `pre-dev` → AC1 et AC2 rouges (statut
  `refunded`), témoin vert ; correctif remis → 3 verts.
