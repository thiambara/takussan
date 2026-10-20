---
id: TCK-1066
title: "La création d'une réservation ne dit plus quels clients et quels biens existent (P62.02)"
status: done
phase: P2
family: bug
estimate: M
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
tags: [back, bookings, authorization, pistes]
---

## Objectif utilisateur

Un compte connecté qui n'a aucun droit sur une agence ne peut plus apprendre, en tentant une
réservation, qu'un client ou un bien de cette agence existe, ni dans quel état est un bien qu'il ne
voit pas.

## Contexte

Réf : **P62.02** du fichier de pistes (angle 62), `validé` par le porteur (critère V2 accordé).

`StoreBookingRequest::authorize()` rend `true` ; `exists:customers,id` et `exists:properties,id` se
jugeaient avant toute autorisation. Mesuré avant correctif, compte sans agence, bien publié d'une
agence tierce : client tiers → 403 `http.forbidden`, client absent → 422 sur `customer_id` ; bien
privé → 403 `booking.property_unavailable`, bien brouillon ou vendu → 422
`booking.property_unavailable`, bien absent → 422 sur `property_id`.

## Décision du porteur

> (a) comme P62.01 : `customer_id` jugé dans le service avec la réponse du refus, visibilité avant état pour un appelant hors personnel (porteur, 2026-10-20)

Et, pour P62.01 à P62.07 : « juger l'existence dans le service avec la réponse du refus (modèle de
TCK-599) ; test : même statut et même corps pour un absent et un tiers ».

## Hypothèses (mode sans humain)

- « Comme P62.01 » vaut aussi pour `property_id` : la `Piste` demande « bien absent, brouillon et
  privé, mêmes statut et corps ». Le bien absent reçoit donc le refus d'un bien invisible (403
  `booking.property_unavailable`), jugé dans le contrôleur comme `FavoriteController::store()`.
- Le propriétaire du bien n'est pas « hors personnel » au sens de l'oracle : il connaît son bien. Il
  garde l'ordre d'avant (état, puis `booking.own_property`).

## Contrat de données

`POST /api/bookings` (inchangé dans sa forme). `property_id` et `customer_id` deviennent
`integer` sans `exists:`.

## Contraintes strictes (métier)

- Le personnel de l'agence du bien et le super-admin gardent le refus d'état en 422.
- Un identifiant non entier reste un 422 sur le champ.

## Delta à produire

- [x] `StoreBookingRequest` : `property_id` `['required', 'integer']`, `customer_id`
      `['nullable', 'integer']`.
- [x] `BookingController::store()` : bien absent → 403 `booking.property_unavailable`.
- [x] `BookingService::create()` : pour qui n'est ni du personnel ni le propriétaire, la visibilité
      se juge avant l'état ; un client absent tombe dans le refus d'un client tiers.
- [x] Test : `tests/Feature/Api/BookingExistenceOracleTest.php`.

## Critères d'acceptation

- [x] AC1 — client absent et client tiers : même statut (403) et même corps.
- [x] AC2 — bien absent, privé, brouillon et vendu d'une agence tierce : même statut (403) et même
      corps (`booking.property_unavailable`).
- [x] AC3 — le personnel de l'agence garde 422 `booking.property_unavailable` sur un brouillon.
- [x] AC4 — `property_id=abc` et `customer_id=xyz` → 422 sur les deux champs.

## Hors périmètre

- P62.01 et P62.03 à P62.07 (autres routes de la même famille).
- Un débit propre à `POST /api/bookings`.

## Notes d'implémentation

- Ablation 1 : `exists:` remis dans `StoreBookingRequest` → 2 rouges (client absent 422 sur `customer_id` contre 403 ; bien absent 422 sur `property_id`). Ablation 2 : `BookingService` seul remis à l'état d'avant → 2 rouges (brouillon et vendu tiers en 422 au lieu de 403, et `BookingTest::test_cannot_create_booking_on_unbookable_property`). Correctif remis → 20 verts sur les trois classes, 212 sur les onze classes de réservation et d'autorisation voisines.
- Avant correctif, `property_id=abc` faisait répondre **500** : `exists:properties,id` interrogeait une colonne entière avec une chaîne (PostgreSQL). La règle `integer` le ferme ; AC4 le garde.
- `BookingTest::test_cannot_create_booking_on_unbookable_property` attendait 422 pour un client sur un bien vendu : c'est l'ordre que la décision inverse. Il attend désormais 403 `booking.property_unavailable`.
- Le propriétaire est exclu du test de visibilité préalable : il garde l'ordre d'avant (état, puis `booking.own_property`), sans oracle puisqu'il connaît son bien.
