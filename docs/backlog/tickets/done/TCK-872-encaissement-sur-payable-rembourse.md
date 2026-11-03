---
id: TCK-872
title: "Un encaissement en ligne sur un payable `refunded` est marqué doublon et signalé, plus refusé en 422"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-871]
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

Réf : **P39.02** du fichier de pistes, `validé` par le porteur (critère accordé : V1). La garde du
double encaissement de `PaymentGatewayService::applyStatusToPayment` (branche `SUCCESS`) ne couvrait
que `paid` et `cancelled`. Sur un payable `refunded`, elle tentait `paid`, que la matrice de
`HasPaymentAttributes` refuse : le webhook rendait 422 `payment.status_transition_invalid` à chaque
relivraison, la transaction était annulée, et l'argent du second checkout n'était tracé nulle part.

## Décision du porteur

`refunded` est traité comme `cancelled` dans la garde du double encaissement : doublon marqué, agence prévenue, réponse 200 ; test : le scénario mesuré

## Objectif utilisateur

L'agence est prévenue d'un encaissement reçu sur une échéance déjà remboursée, pour le rendre.

## Contrat de données

Aucun endpoint neuf. Une entrée `metadata.gateway_duplicate_payment[]` et une notification
`payment.duplicate`, comme pour `paid` et `cancelled`.

## Contraintes strictes (métier)

- Le payable reste `refunded`.
- Le rejeu du même webhook n'ajoute ni entrée ni notification.

## Delta à produire

- [x] `PaymentGatewayService` : `refunded` dans la garde du double encaissement.
- [x] Tests : `tests/Feature/Api/PaymentWebhookRefundTest.php` (scénario mesuré, et vérification
  forcée du règlement remboursé).

## Critères d'acceptation

- [x] AC1 — Échéance soldée par `spy_txn_1` puis remboursée, `spy_txn_2` payé → 200, échéance
  `refunded`, une entrée de doublon de 150 000 pour `spy_txn_2`, une notification `payment.duplicate`
  à l'admin de l'agence ; le rejeu → 200, toujours une entrée.
- [x] AC2 — La vérification forcée (`verify()`) du règlement remboursé lui-même ne le marque pas
  doublon.

## Hypothèses

- « Traité comme `cancelled` » vaut pour l'effet (doublon marqué, agence prévenue, 200). Une
  différence est gardée : une échéance annulée n'a été soldée par rien, une échéance remboursée l'a
  été. Le règlement remboursé, rejoué (une session du fournisseur reste « réglée » après son
  remboursement, et `verify()` ne passe pas par la déduplication des webhooks), n'est donc pas
  recompté : `isSettledBy` s'ajoute au test du doublon déjà marqué. Sans cela, une vérification
  forcée signalait un faux double encaissement (AC2).

## Hors périmètre

- La politique de relivraison des fournisseurs, non établie.

## Notes d'implémentation

- Ablation : service remis à l'état de TCK-871 → AC1 (422) et AC2 (422) rouges. Variante
  strictement « comme `cancelled` » (doublon déjà marqué seulement) → AC1 vert, AC2 rouge (faux
  doublon). Correctif remis → 5 verts dans la classe.
