---
id: TCK-1158
title: "Un reversement au bailleur dont une pièce n'est plus payée ne se prépare, ne s'approuve ni ne se verse"
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
    - "docs/models-spec.md#28-payout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-76--effets-aval-dun-paiement-soldé-puis-passé-à-refunded"
tags: [back, paiements, reversements, pistes]
---

## Contexte

Réf : **P76.03** du fichier de pistes, `validé` (V1 accordé).

`assertItemsInScope()` exige `paid` à la préparation, hors de la transaction ; `createLocked()`
relit les pièces sans revérifier leur statut, et `approve()` comme `markProcessed()` ne relisent
pas les échéances rattachées. Une échéance soldée par l'intégration propre à l'agence, rattachée à
un reversement `pending` puis remboursée par webhook, était versée au bailleur.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** : la piste n'a qu'une voie, la même relecture que P76.01 (TCK-1156). Une pièce
rattachée qui n'est plus `paid` fait refuser `approve()` et `markProcessed()` par 422
`payout.items_changed`. Dans `createLocked()`, le contrôle de statut, relu sous les verrous,
reprend l'erreur de validation d'`assertItemsInScope()` (`money_out.payout.ineligible_item` sur
`lease_payment_ids` / `booking_payment_ids`), pour que la préparation réponde de même quel que soit
le moment du remboursement.

## Objectif utilisateur

Le personnel de l'agence ne peut plus verser au bailleur un loyer remboursé au locataire.

## Delta à produire

- [x] `PayoutService::assertItemsStillPaid()`, sous le verrou d'`approve()` et de `markProcessed()`.
- [x] Relecture du statut des pièces dans `createLocked()`, après les verrous.
- [x] Code d'erreur `payout.items_changed` (fr, en ; `wo` en français, pause du wolof).
- [x] `PayoutRefundedItemsTest`.

## Critères d'acceptation

- [x] AC1 — loyer de 150 000 rattaché à un reversement `pending`, puis remboursé :
      `mark-processed` → 422 `payout.items_changed`, reversement toujours `pending`.
- [x] AC2 — reversement `awaiting_approval` dont le loyer est remboursé : `approve` → 422,
      reversement toujours `awaiting_approval`.
- [x] AC3 — loyer remboursé entre `assertItemsInScope()` et la relecture sous verrou :
      `POST /api/payouts` → 422 sur `lease_payment_ids`, aucun reversement créé.

## Hors périmètre

- Un reversement déjà `completed` dont une pièce est remboursée ensuite (même question que le
  reste de P76.01, P39.07).
- Le remboursement partiel (P76.02).

## Notes d'implémentation

- AC3 simule la course par un écouteur `LeasePayment::retrieved` qui rembourse la ligne à sa
  première lecture (celle d'`assertItemsInScope()`) : sans relecture sous verrou, la préparation
  rendait 201.
- Ablation : `PayoutService` rendu à son état d'avant → 3 rouges (200, 200, 201) ; remis → 3/3.
