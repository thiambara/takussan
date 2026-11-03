---
id: TCK-734
title: "Garde de sous-paiement : chaque pilote de paiement rend le montant et la devise encaissés"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements"
tags: [back, payments, pistes]
---

## Contexte

Réf : **P04.06** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

`PaymentGatewayService::assertReportedAmountCoversPayment()` refuse en 422 `payment.amount_short`
un webhook « payé » dont le montant est inférieur au montant dû. Elle sort sans rien comparer
quand l'événement ne porte pas `metadata.amount`. Or `LemonSqueezyDriver::extractFees()`, par où
passent les deux chemins Lemon Squeezy (webhook générique et événements du paquet), ne rend
jamais `amount`. Un ordre Lemon Squeezy d'un montant inférieur solde donc l'échéance.

## Décision du porteur

Lemon Squeezy, Wave et Flutterwave : chaque pilote fournit amount et currency, et un test l'exige de tout pilote (Flutterwave n'a pas encore de pilote : la règle s'appliquera à sa création) ; Orange Money attend un exemple réel de notification ; reste : Orange Money, sur un exemple réel de notification

## Reste à faire

Orange Money, sur un exemple réel de notification

## Objectif utilisateur

Un paiement en ligne Lemon Squeezy d'un montant inférieur à l'échéance ne la solde pas, comme
c'est déjà le cas pour Wave.

## Contrat de données

- L'événement de paiement Lemon Squeezy porte `amount`, en unité majeure (`total / 100`, symétrique
  du `custom_price` envoyé en centimes à l'initiation, principe 3 du `CLAUDE.md`), et `currency`.
- Aucun changement de route, de schéma ni de texte.

## Contraintes strictes (métier)

- **Hypothèse** : `amount` vient de `total` seul, exprimé dans la devise de la boutique
  (`currency`). Sans `total`, `amount` est nul et la garde ne compare pas : `total_usd` n'est pas
  dans la devise annoncée.
- La garde ne compare qu'à devise égale, comme avant : une boutique en USD pour un payable en XOF
  reste non comparée. Le refus de ce cas à l'initiation est P04.07.

## Delta à produire

- [x] `LemonSqueezyDriver::extractFees()` rend `amount`.
- [x] Test qui exige `amount` numérique et `currency` de l'événement « payé » de tout pilote de
      `PaymentGatewayService::DRIVERS`, Orange Money excepté et nommé (reste).
- [x] Test de bout en bout : un ordre Lemon Squeezy inférieur au dû est refusé en 422
      `payment.amount_short` et l'échéance reste due.

## Critères d'acceptation

- [x] AC1 — Wave et Lemon Squeezy : l'événement « payé » porte un `amount` numérique en unité
      majeure et une `currency`. Un pilote ajouté à `DRIVERS` sans exemple de notification fait
      rougir le test.
- [x] AC2 — Échéance de 19,99 USD, ordre Lemon Squeezy de 1 000 centimes : 422
      `payment.amount_short`, paiement `pending`. Ordre de 1 999 centimes : `paid`.

## Hors périmètre

- Orange Money (devise `OUV` du bac à sable, forme réelle des notifications) : reste du porteur.
- La devise de la boutique Lemon Squeezy différente de celle du payable : P04.07.

## Notes d'implémentation

- **Ablation** : sans la ligne `amount` d'`extractFees()`, 2 rouges (`PaymentDriverReportsAmountTest`,
  `test_an_order_below_the_amount_due_does_not_settle_the_payment`) ; remise, 6 sur 6 verts.
- **Piège** : deux fixtures écrivaient `'amount' => 19_99`, soit 1 999 USD, réglés par un ordre de
  1 999 centimes. Invisible tant que la garde ne comparait rien ; `ListenerSideEffectsRunOnceTest`
  l'a révélé dans `bin/impacted-tests.php --run`.
- Le test des pilotes construit l'`Integration` sans la sauvegarder, et la requête doit porter
  `Content-Type: application/json` pour que `$request->all()` lise le corps.
