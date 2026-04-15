---
id: TCK-008
title: Annulation booking avec remboursement partiel
status: todo
phase: P3
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-002, TCK-026]
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#30-setting-
    - docs/models-spec.md#12-appnotification-
tags: [back, booking, payments]
---

## Contexte

Issu du warning `features.md §1.3 P3` (ligne 127). La colonne `refund_amount`
existe déjà sur `BookingPayment` — le ticket concerne la logique applicative
autour du calcul et de l'application du remboursement.
Le remboursement automatique via provider est délégué à TCK-002.

## Objectif

Permettre à un agent ou à un client d'annuler une réservation et de déclencher
un remboursement partiel automatique selon un barème configurable.

## Delta à produire

- [ ] Service `BookingCancellationService` (calcul basé sur `Booking.start_date - now()`)
- [ ] Barème stocké dans `Setting` (scope agency, key `booking.refund_policy`)
- [ ] Endpoint `POST /api/bookings/{booking}/cancel`
- [ ] Mise à jour `Booking.status = cancelled` + création du remboursement sur `BookingPayment`
- [ ] Notification `AppNotification` au client et au bailleur
- [ ] Journalisation `activity_log` avec `{ refund_amount, policy_applied }`
- [ ] Permissions distinctes pour client / agent / admin

## Critères d'acceptation

- [ ] Barème par défaut : >30j → 100%, 15–30j → 75%, 7–14j → 50%, <7j → 0%
- [ ] Le barème peut être overridé par agence via `Setting`
- [ ] Les trois rôles peuvent initier l'annulation selon leurs permissions
- [ ] L'annulation est idempotente (rejetée si `Booking.status = cancelled`)

## Hors périmètre

- Remboursement automatique via provider → TCK-002
- Politique « force majeure » (override manuel)

## Notes d'implémentation

_(à remplir par spec-coder)_
