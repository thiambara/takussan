---
id: TCK-003
title: Rapprochement bancaire semi-automatique
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#30-setting-
tags: [back, payments, admin]
---

## Contexte

Issu du warning `features.md §1.5 P2` (ligne 161), justifié en passe 006 comme
applicatif (import CSV, pas de modèle dédié). Décision: réutiliser `Setting`
pour l'historique d'imports plutôt que créer un `ReconciliationBatch`.

## Objectif

Permettre à un admin d'importer un relevé bancaire CSV et de le rapprocher
automatiquement des paiements en attente, avec une étape de validation
manuelle des écarts.

## Delta à produire

- [ ] Endpoint `POST /api/reconciliation/import` (upload CSV + mapping colonnes)
- [ ] Service `BankReconciliationService` avec heuristique `amount` + `paid_at ±2j` + `reference`
- [ ] Écran d'arbitrage 3 colonnes : matchés auto / à valider / sans correspondance
- [ ] Actions valider/rejeter/matcher manuellement par ligne
- [ ] Mise à jour `BookingPayment.status = paid` + `activity_log` sur validation
- [ ] Historique des imports stocké via `Setting` (scope agency)

## Critères d'acceptation

- [ ] Un CSV de 50 lignes avec 30 matches exacts, 10 propositions, 10 orphelins est traité correctement
- [ ] La validation manuelle d'une ligne met à jour le paiement et journalise l'action
- [ ] Le CSV source est stocké et consultable via l'historique d'imports
- [ ] Aucun nouveau modèle n'est créé

## Hors périmètre

- Connexion API bancaire directe (PSD2)
- Matching par ML (heuristique déterministe uniquement)

## Notes d'implémentation

_(à remplir par spec-coder)_
