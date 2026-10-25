---
id: TCK-2052
title: "Un remboursement d'acompte ou de loyer déjà sorti donne un Payout « constaté », que le débit du relevé rapproche"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#28-payout-"
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#amendement-du-2026-10-23--le-remboursement-déjà-sorti-devient-un-payout-constaté"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-débit-dun-remboursement-dacompte-ou-de-loyer-na-rien-à-quoi-se-rapprocher--le-relevé-ne-peut-plus-se-clore-rapproché-quen-ignorant-la-ligne"
tags: [api, payouts, rapprochement, remboursement, pistes]
---

## Objectif

Le débit bancaire d'un remboursement d'acompte ou de loyer se rapproche d'un `Payout` « constaté »,
né `completed` dans la transaction du remboursement : le relevé peut se clore `reconciled` sans
ignorer la ligne.

## Contexte

Réf : **P110.01** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-23) : ADR-0039, amendement du 2026-10-23 : un `Payout` « constaté », né `completed` dans la transaction du remboursement, hors seuil, `payee_role` `tenant`, marqué et lié par `refunded_payment_type`/`refunded_payment_id` (colonnes additives) ; `landlord_id` d'un acompte = bailleur du bien ; aucun constaté pour un paiement encaissé par la plateforme ; seul `PayoutApprovalRule::unapprovedRecentNet` change parmi les lecteurs (voir la liste de l'ADR)

Le détail (points 1 à 9, relevé des 22 lecteurs, gardes) est dans l'amendement du 2026-10-23
d'ADR-0039, qui fait foi ; ce ticket ne le recopie pas.

- Un débit ne se rapproche que d'un `Payout` `completed` (matcher, recherche, confirmation).
- `BookingPaymentService::refund` et la branche `REFUNDED` du webhook (et `applyPendingRefund`)
  n'écrivent que le statut et `refund_amount` du payable.

## Hypothèses (mode sans humain)

- **Un point d'écriture pour le webhook.** Les deux chemins du webhook (branche `REFUNDED` et
  `applyPendingRefund`) passent par `applyStatusToPayment`, dans la transaction de
  `applyEventToMatchingPayment` (ou de `verify()`). Le constaté y naît après la sauvegarde du
  payable, quand `refund_amount` a crû : la part neuve est la différence (ADR, point 4). Le
  `metadata` du payable est alors celui de l'événement, ce qui permet de juger
  `isSettledByPlatform` sur le règlement qui vient d'être noté.
- **`processed_at`** : le moment du geste, ou de la réception de l'événement. `PaymentEvent` ne
  porte aucune date normalisée du prestataire.
- **`issued_by_id`** : l'auteur du geste manuel ; nul pour le webhook.
- **`notes`** : nulles. Aucun texte neuf ; la marque est portée par les colonnes.
- **`agency_id`** : celle du bail ou de la réservation, celle que lit le rapprochement
  (`resolvePaymentAgencyId`).
- Un acompte dont le bien n'a pas de bailleur (`properties.user_id` nul) ne peut pas porter de
  `landlord_id` (colonne non nulle) : aucun constaté, avec un avertissement au journal.

## Delta à produire

- [x] Migration additive `nullableMorphs('refunded_payment')` sur `payouts`, `$fillable` et
  relation `refundedPayment()` sur `Payout`.
- [x] Service `App\Services\Payout\ObservedRefundPayout` : crée le constaté (points 1 à 9).
- [x] Appel depuis `BookingPaymentService::refund` et `PaymentGatewayService::applyStatusToPayment`.
- [x] `PayoutApprovalRule::unapprovedRecentNet` l'écarte ; `Lease::liveDepositRetention`,
  `PayoutService::releaseDeposit` et `depositRefundLine` lisent la même marque.
- [x] `PayoutResource` et l'export des reversements rendent les deux colonnes.

## Critères d'acceptation

- [x] AC1 — Acompte payé puis remboursé à la main, débit du même montant à J+4 : le débit est
  suggéré sur le constaté, confirmé, et le relevé se clôt `reconciled`.
- [x] AC2 — Même scénario pour un loyer remboursé par le webhook.
- [x] AC3 — Une caution rendue après un loyer remboursé du même locataire ne compte pas le
  constaté dans le cumul du seuil.
- [x] AC4 — Deux remboursements partiels d'un acompte donnent deux constatés, chacun de sa part ;
  l'acompte, encore `paid`, reste préparable pour le bailleur.
- [x] AC5 — Le remboursement par webhook d'un acompte encaissé par la plateforme ne crée aucun
  `Payout`.
- [x] AC6 — Le constaté d'un acompte porte en `landlord_id` le bailleur du bien ; il est
  `completed`, `tenant`, sans approbateur ni pivot.

## Suites, hors de ce ticket

- La ligne `Payout` de `docs/models-spec.md` (les deux colonnes) s'écrit en session : la spec est
  fermée à l'implémenteur.
- L'écran des reversements ne distingue pas encore le constaté : la ressource rend la marque.

## Hors périmètre

- Les factures (pas de statut `refunded`, D-51).
- Le libellé du constaté dans l'écran des reversements.

## Notes d'implémentation

- Test : `takussan-api/tests/Feature/Api/Accounting/ObservedRefundPayoutTest.php` (8 cas). Avant
  correctif : 7 rouges sur 8 (colonnes absentes) ; seul le cas « encaissé par la plateforme, aucun
  `Payout` » passait, puisque rien n'en créait.
- Ablations, une à une, chacune remise ensuite : appel retiré de `BookingPaymentService::refund`
  → 3 rouges ; appel retiré d'`applyStatusToPayment` → 4 rouges (dont le remboursement reçu avant
  le paiement, qui passe par `applyPendingRefund`) ; `whereNull('refunded_payment_id')` retiré de
  `PayoutApprovalRule` → 1 rouge ; test `isSettledByPlatform` retiré du service → 1 rouge. Tout
  remis → 8 verts.
- Piège : le webhook écrit `refund_amount` au montant rapporté, pas en cumul. La part neuve se
  calcule donc par différence avant/après dans `applyStatusToPayment`, et non sur le montant de
  l'événement.
- Le type du payable sort sous sa forme courte (`booking_payment`, `lease_payment`) dans la
  ressource et l'export, comme `matched_payment_type` de la ligne de relevé ; la base garde la
  classe, comme `bank_statement_lines`.

