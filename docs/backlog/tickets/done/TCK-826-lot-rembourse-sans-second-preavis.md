---
id: TCK-826
title: "Crédits : un lot remboursé reprend le préavis déjà envoyé pour son lot d'origine"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#95-creditlot-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-24--crédits-et-boost--idempotence-des-achats-remboursements-ce-que-voit-lespace"
tags: [back, credits, boost, notifications, pistes]
---

## Contexte

Réf : **P24.06** du fichier de pistes, `validé` (V1 accordé).

Un lot `refund` hérite de l'échéance de son lot d'origine (`CreditLedger::applyRefund()`, ADR-0061
§4), mais il naît sans `expiry_notice_sent_at`. `CreditExpiryNotifier` le prend donc pour un lot
jamais prévenu : l'espace dont le lot de bienvenue a déjà reçu son préavis en reçoit un second,
pour la même date, dès qu'un boost lui est remboursé.

## Décision du porteur

validé — selon la piste

## Objectif utilisateur

L'administrateur d'un espace n'est prévenu qu'une fois de l'expiration d'un lot de crédits, même
quand une partie lui revient par un remboursement de boost.

## Delta à produire

- [x] `CreditLedger::applyRefund()` : le lot `refund` dont le lot d'origine a déjà été prévenu
      reprend son `expiry_notice_sent_at`.
- [x] `tests/Feature/Credits/RefundLotExpiryNoticeTest.php`.

## Critères d'acceptation

- [x] AC1 — Lot de bienvenue prévenu à J+14, bien loué ensuite : le lot remboursé porte
      `expiry_notice_sent_at`, et le passage suivant de `sendNotices()` n'envoie rien.
- [x] AC2 — Témoin : bien loué avant le préavis, le lot remboursé reste à prévenir, et le passage
      suivant prévient les deux lots.

## Hypothèses

- « Quand son lot d'origine a déjà été prévenu » se lit sur la part du plan (`lot_id`), lot par
  lot : un remboursement réparti sur un lot prévenu et un lot non prévenu ne marque que la part du
  premier.
- Le témoin AC2 garde la règle d'un préavis par lot (ADR-0061 §9) : un lot d'origine pas encore
  prévenu et son lot remboursé reçoivent chacun le leur, comme avant.

## Reste à faire

- Le message du délai de Remontée (`errors.boost.bump_cooldown`, « 24 heures » en dur et date ISO
  brute), seconde moitié de la piste : la garde de parité (`LangGroupParityTest`) exige les mêmes
  placeholders dans les trois langues, et ajouter `:hours` au texte `wo` existant le réécrit, ce
  qui est en pause depuis le 2026-10-16.

## Notes d'implémentation

- **Ablation** : `applyRefund()` d'origine remis, AC1 rougit (`1` préavis au lieu de `0`), AC2
  reste vert ; correctif remis, 2 verts.
