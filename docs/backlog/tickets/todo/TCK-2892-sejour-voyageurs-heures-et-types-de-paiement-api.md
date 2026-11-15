---
id: TCK-2892
title: "API du séjour : le nombre de voyageurs servi, les heures d'arrivée et de départ du bien, et les paiements « Caution » et « Autre »"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2877]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#6-bookingpayment"
tags: [back, bookings, sejour, paiements, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Devant un séjour, l'agent sait combien de voyageurs arrivent, à partir de quelle heure et avant quelle heure ils partent ; il encaisse une caution ou un paiement « autre » sous son vrai nom.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e5 « à partir de 14:00 · avant 11:00 · 2 voyageurs », e6 types « Caution » / « Autre »). `metadata.guests` est écrit par le tunnel public et par `StoreBookingRequest` (l. 103-104) mais jamais servi ; aucun bien ne porte d'heures ; `BookingPaymentType` n'a que `deposit`, `advance`, `fee` (écart accepté par TCK-2594, que le porteur veut voir fait). [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 1 (séjour).

## Contrat de données

- `bookings.guests` ; `properties.check_in_from`, `properties.check_out_before`.
- `BookingResource` : `guests` ; `PropertyResource` : les deux heures.
- `POST /api/bookings/{booking}/payments` : types `security_deposit`, `other`.

## Contraintes strictes (métier)

- `guests` seulement sur un séjour (422 `booking.field_not_for_kind` sinon) ; `metadata.guests` n'est plus lu après le rattrapage.
- Les heures du bien sont facultatives ; l'API n'écrit **aucun défaut** (le front affiche 14:00 / 11:00 quand elles manquent).
- Un paiement `other` exige `notes` ; le reçu PDF nomme les deux types neufs.

## Delta à produire

- [ ] Migration `add_guests_to_bookings` (smallint nullable, rattrapage depuis `metadata->guests`, `down()`).
- [ ] Migration `add_check_in_hours_to_properties` (`check_in_from`, `check_out_before`, time nullables, `down()`) ; `Store`/`UpdatePropertyRequest` les acceptent pour un bien à la nuitée ; `PropertyResource` et `Property::$queryFields`.
- [ ] `BookingService::create` écrit `guests` en colonne.
- [ ] `BookingPaymentType` : `SecurityDeposit = 'security_deposit'`, `Other = 'other'` ; `StoreBookingPaymentRequest` ; vue du reçu.
- [ ] Tests : `BookingGuestsTest` (colonne, rattrapage, 422 hors séjour), `PropertyCheckInHoursTest`, `BookingPaymentTypesTest` (caution, autre sans note → 422, reçu).

## Critères d'acceptation

- [ ] AC1 — Un séjour créé par le tunnel public avec `guests = 2` rend `guests = 2` ; un séjour d'avant la migration qui portait `metadata.guests = 3` rend `guests = 3`.
- [ ] AC2 — Un bien à la nuitée enregistré avec `check_in_from = 15:00` et `check_out_before = 11:00` les rend ; un bien sans heures rend `null` pour les deux.
- [ ] AC3 — `POST /api/bookings/{id}/payments` avec `type = security_deposit` crée le paiement ; avec `type = other` sans `notes`, 422.

## Hors périmètre

- L'écran (TCK-2877) ; la candidature et l'offre (TCK-2870).

## Notes d'implémentation

_(à remplir par implementing-specs)_
