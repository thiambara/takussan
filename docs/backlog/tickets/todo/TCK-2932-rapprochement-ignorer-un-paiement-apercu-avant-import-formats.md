---
id: TCK-2932
title: "Rapprochement : ignorer un paiement sans ligne de banque, lire un relevé avant de l'importer, et servir les formats et banques pris en charge"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2933]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
    - "docs/models-spec.md#41-bankstatementline-"
tags: [back, rapprochement, banque, import, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin sort du « reste à rapprocher » un paiement qui n'aura jamais de ligne de banque, voit ce que l'outil a lu d'un relevé avant de l'importer, et sait quels relevés l'outil sait lire.

## Contrat de données

Écarts de TCK-2675 (`c-1`) et de l'écran e0 (« Ignorer » remplacé par « Chercher » : « aucune route n'ignore un paiement »). Relevé du 2026-11-15 : `POST bank-statement-lines/{line}/ignore` ignore une **ligne** de relevé, rien n'ignore un **paiement** ; l'import (`CsvDriver`, `OfxDriver`) écrit dès l'envoi, sans lecture préalable ; aucune route ne dit les formats ni les banques.

- `POST /api/reconciliation/ignored-payments` (`payable_type`, `payable_id`, motif codé `cash_kept` / `other_account` / `other` + texte) et `DELETE /api/reconciliation/ignored-payments/{id}` pour défaire ; le paiement ignoré sort de `pending-payments` et des compteurs « À rapprocher ». Les paiements du reste à rapprocher sont polymorphes (`ReconciliationOverviewController@pendingPayments` les clé par `classe:id`) : d'où une table, pas une colonne.
- `POST /api/bank-statements/preview` (même corps que l'import) : rend le nombre de lignes lues, ignorées (avec leur raison, comme `ParseTally`), la période et les 10 premières lignes **sans rien écrire**.
- `GET /api/reconciliation/supported-formats` : les formats lus (`csv` avec colonnes réglables, `ofx`) et la liste des **banques à préréglage validé**.

## Contraintes strictes (métier)

- **[D-67](../../../ardoise.md#d-67--aucun-relevé-wave-business-ni-orange-money-réel-na-servi-à-régler-limport-des-relevés)** (décision du porteur, 2026-10-06) : aucun préréglage de colonnes n'est écrit sans un export réel du fournisseur. La liste des banques ne contient **que** des banques dont un export réel a été lu et dont le préréglage est éprouvé par un test sur ce fichier (anonymisé). Tant qu'aucun n'est fourni, la liste est vide et seuls les formats sont rendus. Le ticket demande les exports au porteur (CBAO, Ecobank, SGBS, Wave Business, Orange Money) dans sa PR.
- `preview` n'écrit rien : aucun `bank_statements`, aucune ligne, aucun média conservé.
- Ignorer un paiement est journalisé (qui, quand, motif) et réservé à `payments.reconcile`, dans l'agence.

## Delta à produire

- [ ] Migration `create_reconciliation_ignored_payments_table` (`agency_id`, `payable_type`, `payable_id` unique ensemble, `reason`, `note`, `ignored_by`, horodatage) ; `down()` juste ; modèle au `models-spec.md`.
- [ ] Routes d'ajout / retrait ; exclusion dans `pendingPayments` et `overview`.
- [ ] `preview` (driver en mode lecture seule).
- [ ] `supported-formats` (registre des préréglages, vide aujourd'hui).
- [ ] Tests : `ReconciliationIgnorePaymentTest`, `BankStatementPreviewTest` (aucune écriture), `SupportedFormatsTest`.

## Critères d'acceptation

- [ ] AC1 — Ignorer un paiement en espèces avec le motif `cash_kept` le retire de `GET /api/reconciliation/pending-payments` et décrémente « À rapprocher » de `overview` ; le `DELETE` l'y remet. Un agent sans `payments.reconcile` reçoit 403 ; un paiement de l'agence B, 404.
- [ ] AC2 — `POST /api/bank-statements/preview` avec un CSV de 12 lignes dont 2 illisibles rend `read: 10`, `skipped: 2` (raisons), la période et 10 lignes ; le nombre de lignes de `bank_statements` et `bank_statement_lines` est inchangé.
- [ ] AC3 — `GET /api/reconciliation/supported-formats` rend `csv` et `ofx`, et `banks: []` tant qu'aucun préréglage éprouvé n'existe ; un préréglage ajouté avec son fichier de test y paraît.

## Hors périmètre

- L'écran (TCK-2933). Écrire un préréglage sans export réel (interdit par D-67).

## Notes d'implémentation

_(à remplir par implementing-specs)_
