---
id: TCK-028
title: Transactions & paiements
status: todo
phase: P1
family: applicatif
estimate: L
created: 2026-04-15
updated: 2026-04-16
depends_on: [TCK-026, TCK-027]
blocks: [TCK-032]
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#25-invoice-
    - docs/models-spec.md#28-payout-
tags: [back, front, payments, invoices, payouts, transactions]
---

## Contexte

Les paiements sont enregistrés via `BookingPayment` et `LeasePayment` (implémentés dans TCK-026 et TCK-027). Ce ticket ajoute la couche transactionnelle : factures, reversements bailleurs, historique consolidé et suivi des statuts. Les modèles `Invoice` et `Payout` sont nouveaux.

## Objectif

Implémenter la génération de factures, les reversements aux bailleurs après commission, l'historique consolidé des paiements et le suivi des statuts de transaction.

## Delta à produire

> **Note de phase** : Ce ticket est P1 car il nécessite TCK-026 (BookingPayment) et TCK-027 (LeasePayment). Le trait `HasPaymentAttributes` peut être extrait en P0 dans TCK-026/027 directement si un MVP strict est requis.

### P1 — MVP

- [ ] Trait `HasPaymentAttributes` : casts et scopes partagés entre BookingPayment et LeasePayment
- [ ] Endpoint `POST /api/payments` — enregistrer un paiement (routage vers BookingPayment ou LeasePayment selon contexte)
- [ ] Tests : `PaymentRegistrationTest`

### P1 — Suite

- [ ] Migration `invoices` : `invoiceable_id`, `invoiceable_type`, `customer_id`, `invoice_number`, `amount`, `tax_amount`, `total_amount`, `status`, `due_date`, `paid_date`, `currency`
- [ ] Endpoint `POST /api/invoices` — générer une facture à un Customer
- [ ] Migration `payouts` : `agency_id`, `landlord_id`, `lease_id`, `amount`, `commission_amount`, `net_amount`, `status`, `payment_method`, `reference`, `period_start`, `period_end`
- [ ] Endpoint `POST /api/payouts` — reversement au bailleur après commission
- [ ] Endpoint `GET /api/payments/history` — historique consolidé par entité (bien, bail, client)
- [ ] Endpoint `GET /api/payments/history?entity_type=property&entity_id=` + filtres (status, date)
- [ ] Suivi des statuts (pending, paid, refunded, cancelled) avec transitions validées
- [ ] Pages Next.js : historique paiements, génération facture, reversements
- [ ] Tests : `InvoiceGenerationTest`, `PayoutTest`, `PaymentHistoryTest`, `PaymentStatusTransitionTest`

### P2

- [ ] Intégration passerelle de paiement (→ P2 futur)
- [ ] Rapprochement bancaire semi-automatique (→ P2 futur)
- [ ] Relance automatique factures en retard (job schedulé)

### P3

- [ ] Commissions automatiques par agent / collaborateur (→ P3 futur)
- [ ] Comptabilité exportable FEC (→ P3 futur)

## Critères d'acceptation

- [ ] Un paiement peut être enregistré pour une réservation ou un bail
- [ ] Une facture est générée avec un numéro séquentiel unique
- [ ] Un reversement calcule correctement le montant net (montant − commission)
- [ ] L'historique consolide BookingPayments et LeasePayments avec filtres
- [ ] Les transitions de statut sont validées (pas de retour à `pending` depuis `paid`)
- [ ] Un paiement partiel (montant < attendu) est accepté et le statut reste `pending` jusqu'à solde complet ; la différence est tracée (`remaining_amount` calculé dynamiquement)

## Hors périmètre

- Passerelle de paiement externe (→ P2 futur)
- Rapprochement bancaire (→ P2 futur)
- Commissions automatiques (→ P3 futur)
- Export FEC (→ P3 futur)

## Notes d'implémentation

_(à remplir par implementing-specs)_
