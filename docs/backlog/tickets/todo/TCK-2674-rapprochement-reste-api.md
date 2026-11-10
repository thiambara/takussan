---
id: TCK-2674
title: "Rapprochement, côté API : ce qui est déjà confirmé, et le reste à rapprocher paiement par paiement"
status: todo
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2675]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
    - "docs/models-spec.md#41-bankstatementline-"
    - "docs/models-spec.md#15-leasepayment-"
tags: [back, finances, reconciliation, audit-ux, app]
---

## Objectif utilisateur

L'admin voit que la plupart de ses encaissements sont déjà confirmés par Wave et Orange Money, et ne rapproche à la main que les espèces et les virements qui restent.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- Rapprochement par relevé (`routes/api/accounting.php`) : import CSV / OFX, mapping, liste, détail, lignes, `match` (POST / DELETE), `ignore`, `finalize`, `payment-search`. La suggestion vit **sur la ligne** (`match_status = suggested`, `matched_payment_type/id`, `match_confidence`).
- Côté paiement : `bank_reconciled_at`, `bank_statement_line_id` (bail, réservation, facture, reversement) ; `LeasePayment::scopeWhereNotReconciled`, `scopeAwaitingBankCredit` (non rapproché et non réglé par la plateforme). La confirmation par une passerelle se lit dans `metadata.gateway.settled_by` (identifiant de transaction, ou `manual`) et `metadata.gateway.provider` ; `payment_method` distingue `cash`, `bank_transfer`, `wave`, `orange_money`…
- **Aucune route** ne compte « confirmés automatiquement » ni ne liste « paiements déclarés à rapprocher » avec leur ligne proposée. **Aucune confirmation groupée**. Aucune recherche de ligne de relevé à l'échelle de l'agence.
- Préréglages Wave Business / Orange Money : absents, par décision (dette D-67).

## Contraintes strictes (métier)

- Capacité `payments.reconcile` (rôle système d'admin, jamais d'agent), comme tout le rapprochement.
- « Confirmé automatiquement » = paiement payé dans la période et réglé par une passerelle (`settled_by` différent de `manual`). « À rapprocher » = paiement payé dans la période, réglé à la main (`marked_paid_at` posé ou `settled_by = manual`) et non rapproché (`bank_reconciled_at` nul). Règle neuve : `spec-delta.md`.
- La confirmation groupée réutilise exactement le geste unitaire `match` (mêmes effets sur la ligne, le paiement et le statut du relevé), dans une transaction ; elle n'accepte que des lignes `suggested` de l'agence.
- Les débits et les reversements gardent leur rapprochement sur le détail d'un relevé : rien n'est retiré.

## Delta à produire

- [ ] `GET /api/agencies/{agency}/reconciliation/overview?period=YYYY-MM` → `ReconciliationOverviewController` : `payments_total`, `confirmed_automatically {total, by_provider{}}`, `to_reconcile {total, by_method{}}`, `reconciled_manually`.
- [ ] `GET /api/agencies/{agency}/reconciliation/pending-payments?period=&filter[payment_method]=cash,bank_transfer&filter[has_suggestion]=1` → paiements à rapprocher (type, id, référence, payeur, bien, montant, `paid_at`, moyen) et `suggested_line {id, statement_id, date, label, amount, confidence} | null` ; tri `-amount`.
- [ ] `GET /api/agencies/{agency}/bank-statement-lines?filter[match_status]=unmatched&filter[amount]=&filter[date_from]=&filter[date_to]=` (recherche d'une ligne pour un paiement donné).
- [ ] `POST /api/agencies/{agency}/bank-statement-lines/confirm-batch` (`line_ids[]` ≤ 200) → `BankStatementLineController::confirmBatch`.
- [ ] Tests : `ReconciliationOverviewTest`, `ReconciliationPendingPaymentsTest`, `BankStatementLinesSearchTest`, `BankStatementLinesConfirmBatchTest`.

## Critères d'acceptation

- [ ] AC1 — Sur une fixture de novembre (540 paiements Wave réglés par webhook, 272 Orange Money, 21 espèces et 13 virements marqués payés), `overview` rend `confirmed_automatically.total = 812`, `by_provider = {wave: 540, orange_money: 272}`, `to_reconcile.total = 34`.
- [ ] AC2 — Un paiement en espèces avec une ligne `suggested` à 96 % sort avec `suggested_line.confidence = 96` ; confirmé, il quitte `pending-payments` et `to_reconcile` baisse de 1.
- [ ] AC3 — `confirm-batch` avec une ligne `unmatched` dans le lot → 422 et aucune ligne confirmée (relu en base).
- [ ] AC4 — Un agent reçoit 403 sur les quatre routes ; une autre agence ne voit aucune de ces lignes.

## Hors périmètre

- L'import guidé avec aperçu des colonnes (approche A, non retenue).
- Les préréglages de banques (D-67).
- L'écran (TCK-2675).

## Notes d'implémentation

_(à remplir par implementing-specs)_
