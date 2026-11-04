---
id: TCK-724
title: "Rapprochement bancaire : seules les factures envoyées, en retard ou payées sont rapprochables"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-25--rapprochement-bancaire-quand-une-pénalité-est-incluse-dans-lencaissement
tags: [back, accounting, reconciliation, invoices, pistes]
---

## Contexte

Réf : **P25.04** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

Le matcher (`ReconciliationMatcher::fetchCandidates()`) et la recherche manuelle
(`PaymentSearchService::searchInvoices()`) ne filtraient les factures sur aucun statut : une
facture `draft`, `cancelled` ou `void` de 33 333 était suggérée à 70 sur un crédit de 33 333.
`ReconciliationManager::confirmMatch()` ne jugeait le statut que des reversements
(`payout_not_completed`) : une facture annulée pouvait recevoir `bank_reconciled_at`.

## Décision du porteur

seuls les statuts sent, overdue et paid sont rapprochables, et `confirmMatch()` refuse les autres

Hypothèses (mode sans humain) :

- « Rapprochables » vaut pour les trois chemins que cite la `Piste` : matcher, recherche manuelle et
  `confirmMatch()`.
- Le refus de `confirmMatch()` suit la forme de `payout_not_completed` : 422, erreur sur
  `payment_id`, message `reconciliation.validation.invoice_not_reconcilable` (fr et en ; en `wo`, le
  texte français tel quel, le wolof étant en pause).

## Objectif utilisateur

Le comptable d'agence ne se voit proposer, et ne peut rapprocher d'un crédit, que des factures qui
attendent ou ont reçu un encaissement.

## Contraintes strictes (métier)

- Statuts rapprochables d'une facture : `sent`, `overdue`, `paid`. Une seule source :
  `Invoice::RECONCILABLE_STATUSES`.
- Les autres types d'encaissement (`BookingPayment`, `LeasePayment`) et les reversements ne changent
  pas.

## Delta à produire

- [x] `Invoice::RECONCILABLE_STATUSES` et le scope `reconcilable()`.
- [x] `ReconciliationMatcher::fetchCandidates()` : factures bornées par `reconcilable()`.
- [x] `PaymentSearchService::searchInvoices()` : idem.
- [x] `ReconciliationManager::confirmMatch()` : 422 `invoice_not_reconcilable` hors de ces statuts.
- [x] `lang/{fr,en,wo}/reconciliation.php` : `validation.invoice_not_reconcilable`.
- [x] Tests : `BankReconciliationTest::test_une_facture_non_encaissable_n_est_ni_suggeree_ni_confirmable`,
  `::test_une_facture_envoyee_en_retard_ou_payee_reste_rapprochable`,
  `PaymentSearchTest::test_la_recherche_ne_propose_que_les_factures_encaissables`.

## Critères d'acceptation

- [x] AC1 — Une facture `draft`, `cancelled` ou `void` n'est pas suggérée par le matcher.
- [x] AC2 — `POST /api/bank-statement-lines/{line}/match` sur une telle facture rend 422
  (`errors.payment_id`), sans poser `bank_reconciled_at`.
- [x] AC3 — La recherche manuelle ne rend, parmi les six statuts, que `sent`, `overdue` et `paid`.
- [x] AC4 — Une facture `sent`, `overdue` ou `paid` reste suggérée et confirmable.

## Hors périmètre

- Le défaut voisin P25.05 (deux encaissements du même jour, choix au hasard) : autre entrée.
- Le front : le message de refus passe par la prose de l'API, comme `payout_not_completed`.

## Notes d'implémentation

- Le helper `invoice()` de `PaymentSearchTest` créait des factures `draft` (statut par défaut de
  la factory) : il crée désormais des factures `sent`, sans quoi les tests existants de la recherche
  mesuraient une facture que la décision rend non rapprochable.
- **Ablation complète** : les quatre fichiers d'`app/` remis à `pre-dev` → les deux tests d'exclusion
  rouges (`Failed asserting that 1 is null`, puis `two arrays are identical`), le versant autorisé
  vert. **Ablation fine** : la seule garde de `confirmMatch()` retirée, filtres gardés → rouge
  `Expected response status code [422] but received 200`. Correctif remis : 24 verts sur les deux
  classes, 67 sur `tests/Feature/Api/Accounting/`.
