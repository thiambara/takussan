---
id: TCK-026
title: Réservations courte durée & visites
status: todo
phase: P1
family: back
estimate: M
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-034, TCK-020, TCK-048, TCK-051]
blocks: [TCK-028]
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#17-propertyvisit-
tags: [back, booking, visits, payments, calendar]
---

## Contexte

Le modèle `Booking` existe déjà mais nécessite des ajustements (renommage `user_id` → `created_by_id`, suppression `deposit_paid` en faveur d'un accessor). Le modèle `PropertyVisit` est nouveau. Ce ticket couvre le cycle complet de réservation et la planification de visites.

## Objectif

Implémenter le flux complet de réservation courte durée (demande → acceptation → paiement) et la planification de visites avec calendrier agrégé.

## Delta à produire

### P1

- [ ] Migration Booking : renommage `user_id` → `created_by_id`, suppression colonne `deposit_paid`, `customer_id` NOT NULL
- [ ] Accessor `deposit_paid` sur Booking (calcul dynamique depuis `booking_payments`)
- [ ] Endpoints : `POST /api/bookings` (demande), `PUT /api/bookings/{booking}/accept`, `PUT /api/bookings/{booking}/reject`, `PUT /api/bookings/{booking}/cancel`
- [ ] Endpoints BookingPayment : `POST /api/bookings/{booking}/payments` (acompte, solde)
- [ ] Endpoint `GET /api/bookings/{booking}/payments` — consultation des paiements liés
- [ ] Endpoint `GET /api/properties/{property}/calendar` — vue calendrier agrégée (réservations + visites)
- [ ] Contrôle de chevauchement (overlap check) lors de l'acceptation : rejet 409 si une réservation confirmée existe déjà sur la même période pour le même bien
- [ ] Tests : `BookingFlowTest`, `BookingPaymentTest`, `BookingCalendarTest`

### P2

- [ ] Job `ExpireBookingsJob` — expiration automatique des demandes non traitées après X jours
- [ ] Migration `property_visits` : `property_id`, `customer_id`, `agent_id`, `visit_type` (in_person, virtual, autonomous, hybrid), `scheduled_at`, `duration_minutes`, `status`, `feedback`
- [ ] Endpoints CRUD visites : `POST /api/properties/{property}/visits`, `PUT /api/visits/{visit}`
- [ ] Rappels automatiques avant visite (notification email + in-app, via job schedulé)
- [ ] Tests : `BookingExpirationTest`, `PropertyVisitTest`, `VisitReminderTest`

### P3

- [ ] Annulation avec remboursement partiel automatisé (→ P3 futur)

## Critères d'acceptation

**P1 :**

- [ ] Un client peut demander une réservation avec dates et montant
- [ ] Un agent/propriétaire peut accepter, refuser ou annuler une demande
- [ ] L'accessor `deposit_paid` reflète correctement l'état des paiements
- [ ] Le calendrier agrège réservations confirmées et visites planifiées
- [ ] L'acceptation d'une réservation en chevauchement avec une réservation confirmée est rejetée avec 409

**P2 :**

- [ ] `ExpireBookingsJob` passe automatiquement les demandes non traitées à `expired` après le délai configuré
- [ ] Les visites peuvent être de type en personne, virtuel, autonome ou hybride
- [ ] Un rappel est envoyé au client et à l'agent avant une visite planifiée

## Hors périmètre

- Frontend réservations (→ TCK-043)
- Annulation avec remboursement automatisé (→ P3 futur)
- Passerelle de paiement (→ P2 futur)
- Facturation (→ TCK-028)

## Notes d'implémentation

_(à remplir par implementing-specs)_
