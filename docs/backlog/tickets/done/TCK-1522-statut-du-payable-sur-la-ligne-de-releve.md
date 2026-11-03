---
id: TCK-1522
title: "La ligne de relevé rend et affiche le statut du payable rapproché"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-encaissement-rapproché-puis-remboursé-garde-son-rapprochement-et-ni-la-ligne-ni-le-payable-ne-le-disent"
tags: [api, front, reconciliation, pistes]
---

## Contexte

Réf : **P110.02** du fichier de pistes, `validé`. Un encaissement rapproché d'un crédit, puis
remboursé, garde sa ligne `confirmed` et son `bank_reconciled_at` ; la ligne rendait « type #id »
sans le statut du payable, et l'agence ne voyait pas le remboursement depuis le relevé.

## Décision du porteur

validé — porteur (2026-10-22) : signaler, ne pas refuser : le statut du payable rapproché est rendu par `BankStatementLineResource` et affiché sur la ligne

## Objectif utilisateur

L'agence voit, sur la ligne du relevé, qu'un encaissement rapproché a été remboursé depuis.

## Contrat de données

`GET /api/bank-statements/{id}/lines` et les réponses de `match`, `unmatch`, `ignore` rendent
`matched_payment_status` : la valeur de l'enum de statut du payable lié (rapproché ou suggéré),
`null` sans payable.

## Contraintes strictes (métier)

- Rien n'est refusé ni défait : le remboursement reste permis, la ligne reste `confirmed`.
- Le statut est relu à chaque lecture (relation chargée), jamais figé sur la ligne.

## Delta à produire

- [x] `BankStatementLine::matchedPayment` nommée comme sa méthode (voir notes).
- [x] `BankStatementLineController` charge `matchedPayment` (liste et trois gestes).
- [x] `BankStatementLineResource` rend `matched_payment_status`.
- [x] Front : `PayableStatusBadge`, affiché sous la référence du payable dans `StatementDetail`,
  avec les libellés déjà traduits de chaque type (`payments.status`, `payments.invoiceStatus`,
  `payments.payoutStatus`, `billing.platformPayouts.status`).
- [x] Tests : `ReconciledPaymentStatusTest` (API), `rapprochement.test.tsx` (front).

## Critères d'acceptation

- [x] AC1 — acompte rapproché (`paid` dans la réponse de `match`), puis remboursé : la liste des
  lignes rend `matched_payment_status = refunded`, la ligne restant `confirmed`.
- [x] AC2 — une ligne sans payable rend la clé, à `null`.
- [x] AC3 — l'écran affiche « Remboursé » sur la ligne d'un acompte remboursé, « Payée » sur une
  facture payée, rien sur une ligne non rapprochée.

## Hors périmètre

- Refuser le remboursement d'un encaissement rapproché (P39.07, au porteur).
- Le statut du candidat de la recherche manuelle : P110.04 (TCK-1526).

## Notes d'implémentation

- **Piège** : `morphTo('matched_payment')` rangeait la relation chargée d'avance sous
  `matched_payment` ; `load('matchedPayment')` initialisait `matchedPayment` à `null` et l'y
  laissait. Le chargement paresseux (`$line->matchedPayment`, seul usage jusqu'ici) n'était pas
  touché. Corrigé par `morphTo(__FUNCTION__, 'matched_payment_type', 'matched_payment_id')`.
- Ablations : chargement retiré du contrôleur → AC1 rouge (`null` au lieu de `paid`) ; ancien
  nom de relation remis → AC1 rouge de même ; rendu du badge absent de `StatementDetail` → AC3
  rouge (`statut-payable-102` introuvable).
