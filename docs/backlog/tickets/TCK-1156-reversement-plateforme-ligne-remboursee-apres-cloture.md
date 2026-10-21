---
id: TCK-1156
title: "Un reversement de la plateforme dont une ligne n'est plus payée ne s'approuve ni ne se paie"
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
    - "docs/models-spec.md#45-platformpayout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-76--effets-aval-dun-paiement-soldé-puis-passé-à-refunded"
tags: [back, paiements, reversements, pistes]
---

## Contexte

Réf : **P76.01** du fichier de pistes, `validé` (V1 accordé).

La clôture de la plateforme fige brut, commission et net, et pose `platform_payout_id` sur les
lignes. `approve()` et `markPaid()` ne relisent pas ces lignes : un loyer remboursé après la
clôture est approuvé puis versé à l'agence, alors que la plateforme l'a rendu au locataire.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** : la voie que la piste recommande pour un reversement non encore payé, refuser
`approve()` et `markPaid()` par 422 `platform_payout.items_changed` dès qu'une ligne rattachée
n'est plus `paid`, ce qui renvoie à `cancel()` puis à une nouvelle clôture. Pour un reversement
déjà `paid`, la piste laisse à P39.07 le choix entre signaler et compenser : ce volet n'est pas
fait (« Reste à faire »).

## Reste à faire

- le signalement à la console d'un reversement déjà `paid` dont une ligne a été remboursée
  depuis (le choix entre signaler et compenser est celui de P39.07).

## Objectif utilisateur

L'opérateur ne peut plus approuver ni marquer payé un reversement dont une ligne a été remboursée
depuis la clôture.

## Delta à produire

- [x] `PlatformPayoutService::assertItemsStillPaid()`, appelé sous le verrou par `approve()` et
      `markPaid()`.
- [x] Code d'erreur `platform_payout.items_changed` (fr, en ; `wo` en français, pause du wolof).
- [x] `PlatformPayoutRefundedItemsTest`.

## Critères d'acceptation

- [x] AC1 — loyer de 100 000 soldé par la plateforme, clos, puis remboursé : `approve` → 422
      `platform_payout.items_changed`, reversement toujours `pending`.
- [x] AC2 — même scénario remboursé après l'approbation : `mark-paid` → 422, reversement
      toujours `approved`.
- [x] AC3 — `cancel` libère la ligne, et une nouvelle clôture ne la reprend pas.

## Hors périmètre

- Le reversement déjà `paid` (« Reste à faire », P39.07).
- Le remboursement partiel, qui fait sortir toute la ligne de la clôture (P76.02).

## Notes d'implémentation

- Le remboursement est posé en test par l'état que laisse `PaymentGatewayService`
  (`refunded`, `refund_amount`), sans rejouer le webhook : la garde lit le statut, pas le chemin.
- Ablation : les deux appels de `assertItemsStillPaid()` retirés → 2 rouges (AC1, AC2 rendent
  200) ; remis → 3/3.
