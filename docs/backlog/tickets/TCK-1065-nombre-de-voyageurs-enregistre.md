---
id: TCK-1065
title: "La réservation enregistre le nombre de voyageurs que le tunnel exige (P80.02)"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md"
tags: [back, bookings, pistes]
---

## Objectif utilisateur

Le nombre de voyageurs que le visiteur saisit dans le tunnel de réservation n'est plus perdu : il
est enregistré avec la réservation.

## Contexte

Réf : **P80.02** du fichier de pistes (angle 80), `validé (délégué)` (critère V7 accordé).

Le tunnel (`BookingTunnel.tsx`) exige `guests` (1 à 20) et l'envoie à `POST /api/bookings`.
`StoreBookingRequest` n'avait pas de règle `guests`, et le contrôleur ne passe que
`validated()` au service : le nombre était écarté. La demande publique le range déjà dans
`metadata.guests` (`PublicPropertyController::bookingRequest()`).

## Décision du porteur (déléguée)

> accepter `guests` dans `StoreBookingRequest` (`['sometimes', 'integer', 'min:1', 'max:20']`, la borne du tunnel en vigueur) et l'écrire dans `metadata.guests`, comme `PublicPropertyController.php:1036` ; aucune migration, le tunnel ne change pas ; test : `POST /api/bookings` avec `guests=3` → la ligne porte `metadata.guests = 3`, et sans `guests` → `metadata` inchangé ; reste : l'affichage du nombre à l'agence, et l'écart de borne avec le flux public (50), au porteur

## Reste à faire

> l'affichage du nombre à l'agence, et l'écart de borne avec le flux public (50), au porteur

## Hypothèses (mode sans humain)

- `StoreBookingRequest` n'accepte aucune clé `metadata` : `metadata` ne vient donc que de `guests`,
  et l'écrire en entier n'écrase rien.

## Contrat de données

`POST /api/bookings` accepte `guests` (entier, 1 à 20, facultatif). Aucune colonne neuve :
`bookings.metadata` existe et est casté `array`.

## Contraintes strictes (métier)

- Aucune migration ; le tunnel du front ne change pas.
- Sans `guests`, la ligne garde `metadata` à `null`.

## Delta à produire

- [ ] `StoreBookingRequest::rules()` : `'guests' => ['sometimes', 'integer', 'min:1', 'max:20']`.
- [ ] `BookingService::create()` : `guests` → `metadata.guests`.
- [ ] Test : `tests/Feature/Api/BookingGuestsTest.php` (trois cas).

## Critères d'acceptation

- [ ] AC1 — `POST /api/bookings` avec `guests=3` → 201, la ligne porte `metadata = {guests: 3}`.
- [ ] AC2 — sans `guests` → 201, `metadata` reste `null`.
- [ ] AC3 — `guests=0` ou `guests=21` → 422 sur `guests`, aucune réservation créée.

## Hors périmètre

- L'affichage du nombre à l'agence, et l'écart de borne avec le flux public (50) : reste au porteur.
- `BookingResource` : `metadata` n'y est pas exposé, et ne l'est pas davantage ici.

## Notes d'implémentation

_(à remplir par implementing-specs)_
