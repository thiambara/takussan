---
id: TCK-891
title: "`transaction_id` des échéances et des paiements de réservation porte un index"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements"
tags: [back, payments, webhooks, index, migration, pistes]
---

## Contexte

Réf : **P04.11** du fichier de pistes, `validé` par le porteur. `PaymentGatewayService::paymentsForEvent()`
cherche le payable de chaque webhook par `where('transaction_id', …)` sur les trois payables ;
seule `invoices` porte un index sur cette colonne (`invoices_transaction_id_idx`). PostgreSQL
n'indexe rien d'office (piège n° 8 de `CLAUDE.md`).

## Décision du porteur

l'index sur la référence fournisseur ; reste : terminer ou retirer le paiement partiel

## Reste à faire

terminer ou retirer le paiement partiel

## Objectif utilisateur

Un webhook de paiement retrouve son échéance ou son acompte sans relire toute la table.

## Contrat de données

- Migration neuve : index `lease_payments_transaction_id_idx` sur `lease_payments(transaction_id)`
  et `booking_payments_transaction_id_idx` sur `booking_payments(transaction_id)` ; `down()` les
  retire.
- Aucune donnée réécrite, aucun endpoint modifié.

## Contraintes strictes (métier)

- Ajout d'index seul (critère A2) : aucun résultat ne change.

## Delta à produire

- [ ] Migration `2026_10_18_080000_index_payments_on_transaction_id`.
- [ ] Test : `tests/Feature/Database/PaymentTransactionIdIndexTest.php`.

## Critères d'acceptation

- [ ] AC1 — Les deux index existent, sur la seule colonne `transaction_id`.
- [ ] AC2 — La recherche d'un payable par `transaction_id` emprunte l'index (`EXPLAIN`, balayage
  séquentiel interdit, table de test minuscule).

## Hypothèses

- Noms explicites, comme `invoices_transaction_id_idx` (piège n° 3).

## Hors périmètre

- Le paiement partiel (« reste » du porteur).
- Le repli `whereJsonContains('metadata->gateway->transactions', …)`, qu'un index B-tree ne sert pas.

## Notes d'implémentation
