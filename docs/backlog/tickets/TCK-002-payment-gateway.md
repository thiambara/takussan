---
id: TCK-002
title: Intégration passerelle de paiement (Wave / Orange Money / Stripe)
status: blocked
phase: P2
family: applicatif
estimate: L
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-028]
blocks: [TCK-008]
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#31-integration-
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#15-leasepayment-
tags: [back, payments, integration]
---

## Contexte

Issu du warning `features.md §1.5 P2` (ligne 160), justifié en passe 006 comme
applicatif avec traçabilité via `PaymentMethod`.
**Bloqué** sur une décision produit : provider prioritaire (Wave / Orange Money / Stripe).
Recommandation technique: Stripe (SDK mûr, sandbox) en premier, Wave en second.

## Objectif

Permettre à un client de payer en ligne un acompte de réservation ou une échéance
de bail via une passerelle tierce, avec retour automatique du statut dans
`BookingPayment` / `LeasePayment`.

## Delta à produire

- [ ] Config provider par agence via `Integration` (#31) — `provider ∈ {wave, orange_money, stripe}`, `credentials` chiffrées
- [ ] Endpoint `POST /api/payments/{payment}/checkout` → URL de redirection provider-agnostic
- [ ] Webhook `POST /api/payments/webhooks/{provider}` avec vérification de signature
- [ ] Service `PaymentGatewayService` + adapters par provider
- [ ] Écran back-office : tentatives de paiement + statut (`pending` / `succeeded` / `failed` / `refunded`)
- [ ] Tests fake provider (3 états webhook)

## Critères d'acceptation

- [ ] Un agent peut configurer Stripe (MVP) via l'écran `Integration`
- [ ] Un webhook signé `succeeded` met `BookingPayment.status = paid` + `receipt` via `PaymentMethod`
- [ ] Un webhook invalide est rejeté avec log dans `activity_log`
- [ ] Les erreurs provider sont journalisées sur le payment concerné

## Hors périmètre

- Abonnements récurrents
- 3DS manuel (délégué au provider)
- Providers secondaires (→ TCK-002b, TCK-002c)

## Notes d'implémentation

_(à remplir par spec-coder)_
