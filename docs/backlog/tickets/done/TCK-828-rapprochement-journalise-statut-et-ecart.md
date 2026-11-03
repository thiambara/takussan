---
id: TCK-828
title: "Rapprochement : la confirmation journalise le statut de l'encaissement et l'écart de montant"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-25--rapprochement-bancaire-quand-une-pénalité-est-incluse-dans-lencaissement"
tags: [back, accounting, reconciliation, audit, pistes]
---

## Contexte

Réf : **P25.07** du fichier de pistes, `validé` (V1 accordé).

`ReconciliationManager::confirmMatch()` accepte une ligne de 7 500 sur une échéance de 150 000, et
une `LeasePayment` en attente. Son activité `matched` ne retient que le type, l'identifiant et la
confiance : rien ne permet de relire après coup qu'une confirmation portait sur un montant ou un
statut inattendu.

## Décision du porteur

validé — journaliser le statut et l'écart de montant à la confirmation ; reste : les autres points, un par un

## Objectif utilisateur

L'agence et l'équipe de la plateforme peuvent relire, pour chaque rapprochement confirmé, le statut
de l'encaissement et l'écart entre la ligne du relevé et le montant attendu.

## Delta à produire

- [x] Activité `matched` : `payment_status`, `expected_amount` et `amount_gap` (montant de la ligne
      moins montant attendu) en plus des propriétés existantes.
- [x] `LeasePayment::expectedBankAmount()` : la règle de `scopeWhereExpectedAmountNear()` lue en
      PHP (montant figé d'une échéance soldée en ligne, `amount` sinon).
- [x] `tests/Feature/Api/Accounting/ReconciliationConfirmationAuditTest.php`.

## Critères d'acceptation

- [x] AC1 — Ligne de 7 500 confirmée sur une échéance `pending` de 150 000 : la confirmation passe,
      et l'activité porte `payment_status = pending`, `expected_amount = 150000`,
      `amount_gap = -142500`.
- [x] AC2 — Échéance soldée en ligne pénalité comprise (157 500 figés) et ligne de 157 500 : écart 0.
- [x] AC3 — Facture `sent` de 170 000 et ligne de 170 000 : `payment_status = sent`, écart 0.

## Hypothèses

- Le montant attendu suit les colonnes du matcher : `expectedBankAmount()` pour une échéance,
  `total_amount` pour une facture, `net_amount` pour un reversement, `amount` sinon.
- Aucun refus ni avertissement n'est ajouté : la confirmation se comporte comme avant.

## Reste à faire

les autres points, un par un

## Notes d'implémentation

- **Ablation** : `confirmMatch()` d'origine remis, les 3 AC rougissent (clé `payment_status`
  absente) ; `expectedBankAmount()` réduit à `amount`, AC2 rougit seul (écart de 7 500).
- `expectedBankAmount()` double en PHP l'expression SQL du scope : AC2 garde leur accord sur le cas
  qui les distingue.
