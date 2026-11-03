---
id: TCK-1160
title: "Un acompte encaissé en ligne par la plateforme ne se déclare pas remboursé par l'agence"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-76--effets-aval-dun-paiement-soldé-puis-passé-à-refunded"
tags: [back, paiements, reservations, pistes]
---

## Contexte

Réf : **P76.04** du fichier de pistes, `validé` (V7 accordé, avec le V1 que portent ses options).

`BookingPaymentService::refund()` n'exige que `paid` et un montant `≤ amount` : il ne regarde pas
qui a encaissé. Un acompte soldé par une intégration globale est détenu par la plateforme et entre
dans sa clôture ; déclaré remboursé par l'agence, il en sort, alors que la plateforme n'a rien
rendu.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** : la piste pose d'abord une décision de produit (qui rembourse un payable encaissé
par la plateforme), puis deux voies « à défaut ». La plus étroite est la première : refuser le
geste manuel (422 `booking_payment.refund_settled_by_platform`) sur un acompte soldé par une
intégration globale. Le remboursement d'un tel acompte passe par le fournisseur, dont le webhook
l'applique déjà (`PaymentGatewayService`). La seconde voie, garder l'acompte dans la clôture à
hauteur de ce qui reste dû à l'agence, aurait calculé un montant neuf : elle n'est pas prise.

## Objectif utilisateur

Une agence ne peut plus déclarer remboursé un acompte dont la plateforme détient l'argent.

## Delta à produire

- [x] `PlatformPayoutService::isSettledByPlatform()`, la lecture de la clôture (`settled_by` et
      intégration globale), rendue publique.
- [x] Le refus dans `BookingPaymentService::refund()`, sous le verrou.
- [x] Code d'erreur `booking_payment.refund_settled_by_platform` (fr, en ; `wo` en français,
      pause du wolof).
- [x] `BookingPaymentRefundSettledByPlatformTest`.

## Critères d'acceptation

- [x] AC1 — acompte de 10 000 soldé par l'intégration de la plateforme : `refund` → 422
      `booking_payment.refund_settled_by_platform`, acompte toujours `paid`, `refund_amount` nul.
- [x] AC2 — soldé par l'intégration propre à l'agence, ou réglé hors ligne : `refund` → 200, comme
      avant.

## Hors périmètre

- Qui rembourse un payable encaissé par la plateforme, au-delà de ce refus (décision de produit
  que la piste pose en premier ; ADR-0039 ne l'écrit pas).
- Le loyer : `BookingPaymentService` ne rembourse que des acomptes, et le remboursement d'un loyer
  ne passe que par le webhook.

## Notes d'implémentation

- La lecture est celle de la clôture, et non une copie : `isSettledByPlatform()` réemploie
  `settledBy()` et `globalIntegrationIds()`, si bien qu'un acompte refusé ici est exactement un
  acompte que la clôture reverserait.
- Ablation : la condition remplacée par `false` → 1 rouge (AC1 rend 200) ; remise → 3/3.
