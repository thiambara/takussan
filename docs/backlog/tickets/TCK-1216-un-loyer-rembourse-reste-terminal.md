---
id: TCK-1216
title: "Un loyer remboursé reste terminal, ni dû ni payable : la garde"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1214]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-76--effets-aval-dun-paiement-soldé-puis-passé-à-refunded"
tags: [back, paiements, pistes, garde]
---

## Contexte

Réf : **P76.05** du fichier de pistes, `validé` (V7 accordé).

`refunded` est terminal (matrice de `HasPaymentAttributes`), hors de l'impayé
(`CollectedPayments::OWED_STATUSES`) et non payable (`PaymentGatewayService::isPayable`,
`LeasePaymentLinkService::isPayableByNature`). Rien ne disait si c'était voulu, et aucun test ne le
tenait.

## Décision du porteur

> validé — `refunded` reste terminal, ni dû ni payable : un loyer remboursé ne redevient pas dû (un remboursement qui corrige un double encaissement ne doit rendre aucun loyer dû) ; ni réouverture ni annulation ; une échéance neuve (option « remplacée ») seulement sur un geste explicite du personnel, jamais automatiquement ; sous P76.02 (b), le remboursement partiel reste `paid` et sort de cette piste ; garde : un test sur `leaseOwed` et `isPayable` d'une échéance `refunded` (porteur, 2026-10-22)

## Objectif utilisateur

Un loyer remboursé ne revient ni dans l'impayé, ni dans les relances, ni dans un paiement en ligne.

## Delta à produire

- [x] `RefundedRentStaysTerminalTest` : échéance soldée en ligne puis remboursée en entier par le
      fournisseur → hors de `leaseOwed`, `isPayable` et `isPayableByNature` faux, `initiate` 409
      `payment.not_payable`, aucune échéance neuve sur le bail.

## Critères d'acceptation

- [x] AC1 — le test ci-dessus, vert sur le code actuel, rouge si `refunded` entre dans
      `OWED_STATUSES` ou redevient payable.

## Hors périmètre

- Le geste explicite du personnel qui crée une échéance neuve (option « remplacée ») : la décision
  ne le demande pas, elle l'autorise seulement ; il existe déjà comme saisie d'une échéance.
- Le remboursement partiel, qui reste `paid` (TCK-1214).

## Notes d'implémentation

- Aucun code de `app/` ne change : le comportement retenu est celui du code, et la piste en demande
  la garde.
- Ablation : `refunded` ajouté à `OWED_STATUSES` → rouge (« Un loyer remboursé est redevenu dû ») ;
  `refunded` retiré de la liste de `PaymentGatewayService::isPayable()` → rouge ; remis → vert.
