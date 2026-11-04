---
id: TCK-961
title: "Le `metadata` d'un événement de passerelle est rangé sous son entrée de `gateway_events`, et un `failed` sur la transaction qui a soldé l'échéance est ignoré"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-889]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-39--webhooks-de-paiement-refund-et-failed-sur-un-paiement-déjà-soldé"
tags: [back, payments, webhooks, pistes]
---

## Contexte

Réf : **P39.06** du fichier de pistes, `validé` par le porteur (critère accordé : V1, la trace d'un
règlement que l'argent suit). Deux défauts de `PaymentGatewayService::applyStatusToPayment` :

- le `metadata` de chaque événement était fusionné à la racine du payable : un `failed` ou un
  `refunded` reçu après le `paid` remplaçait `amount`, `currency` et `event`, et la trace du
  règlement se perdait ;
- un `failed` reçu sur la transaction qui avait soldé l'échéance posait encore
  `gateway.last_failed_at` sur une échéance payée.

## Décision du porteur

les deux points : le `metadata` d'un événement rangé sous son entrée de `gateway_events`, et un `failed` ignoré sur une transaction `settled_by`

## Objectif utilisateur

L'agence retrouve, pour chaque événement reçu d'un fournisseur de paiement, ce qu'il a rapporté,
sans qu'un événement tardif efface la trace du règlement.

## Contrat de données

- `metadata.gateway_events[]` : chaque entrée porte désormais `metadata`, le `metadata` de son
  événement tel que le pilote l'a rendu (`amount`, `currency`, `event` pour Wave ; `om_status` pour
  Orange Money ; `gross_amount`, `fees_amount`, `net_amount`, `lemon_squeezy_event`, `custom_data`
  pour Lemon Squeezy).
- Ces clés ne sont plus écrites à la racine de `metadata`. Aucun lecteur dans `app/` ni dans
  `takussan-web/src` (mesuré par `grep`, voir Notes).
- Aucun schéma, endpoint ni ressource modifiés.

## Contraintes strictes (métier)

- Un `failed` dont la transaction est `gateway.settled_by` ne change rien au payable : ni
  `last_failed_at`, ni `failed_at` d'une entrée de l'historique. Il reste dans `gateway_events`.
- L'échec du checkout courant d'une échéance ouverte reste tracé dans `last_failed_at` (TCK-593).

## Delta à produire

- [x] `PaymentGatewayService::applyStatusToPayment` : plus de fusion du `metadata` à la racine ;
  `failed` ignoré sur la transaction `settled_by`.
- [x] `PaymentGatewayService::markAsProcessed` : le `metadata` de l'événement sur son entrée.
- [x] Tests : `tests/Feature/Api/PaymentEventTraceTest.php` (4 cas) ;
  `LemonSqueezyEventListenerTest::test_fees_reconciliation_extracts_gross_fees_net` lit les frais
  sur l'entrée de l'événement.

## Critères d'acceptation

- [x] AC1 — Échéance soldée par le webhook Wave `spy_txn_1`, puis `checkout.session.payment_failed`
  sur `spy_txn_1` → ni `event`, ni `amount`, ni `currency` à la racine ; l'entrée `paid` porte
  `{amount: 150000, currency: XOF, event: checkout.session.completed}`, l'entrée `failed` le sien.
- [x] AC2 — Échéance soldée puis remboursée → `refunded`, la trace du `paid` intacte, le
  remboursement sur sa propre entrée.
- [x] AC3 — Le `failed` de AC1 laisse l'échéance `paid`, sans `gateway.last_failed_at`.
- [x] AC4 — Un `failed` sur le checkout courant d'une échéance ouverte pose toujours
  `last_failed_at`.

## Hypothèses

- Les payables écrits avant ce ticket gardent leurs clés à la racine : aucune réécriture de données
  (ce serait V4). Elles ne sont plus mises à jour.
- `verify()` passe un `metadata` vide : rien ne change sur ce chemin.

## Hors périmètre

- Les effets en aval d'un remboursement (P39.07, au porteur).

## Notes d'implémentation

- Ablation : `PaymentGatewayService.php` remis à `pre-dev` → 4 rouges (les 3 cas neufs qui gardent
  le défaut, plus le test des frais Lemon Squeezy, qui lit l'entrée) ; correctif remis → 9 verts
  sur les deux classes. Le 4ᵉ cas de `PaymentEventTraceTest` est un témoin (vert des deux côtés).
- Piège : la colonne est en `jsonb`, qui réordonne les clés ; comparer un tableau associatif par
  `assertEquals`, pas `assertSame`.
