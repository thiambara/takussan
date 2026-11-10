---
id: TCK-2593
title: "Réservations : recherche, compteurs par nature et par statut, et le client servi avec la réservation"
status: todo
phase: P2
family: back
estimate: S
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2579]
blocks: [TCK-2594]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, audit-ux, app]
---

## Objectif utilisateur

L'agent retrouve « les offres reçues sur la villa des Almadies » ou la candidature d'Ousmane Ba en tapant un nom, et voit combien de demandes attendent sa décision dans chaque nature.

## Contrat de données

**Re-mesuré sur `1bce3798a`** (`Booking.php`) : filtres exacts `property_id, customer_id, created_by_id, agency_id, status, currency` (`:63`), `managed_by=me` (`:75-84`), montants (`:93`) ; `filter[status]=completed` **fonctionne déjà** (l'onglet manque côté front, pas l'API) ; **aucune recherche** ; **aucun compteur** ; include `customer` disponible (`:89`) mais l'audit relève qu'aucun écran ne l'affiche.

À créer :
- `filter[search]` : référence, nom et téléphone du client, titre du bien (requête SQL bornée à l'agence, pas Meilisearch).
- `GET /api/bookings/counts?filter[managed_by]=me` : `{stay: {pending, confirmed, completed, rejected, cancelled, expired}, application: {…}, offer: {…}}` sous les mêmes portées que l'index, en une requête groupée.
- Include `customer` : `phone`, `user_id` (pour « Écrire »), `pipeline_stage` dans les `fields[customers]` autorisés ; compte `visits_on_property` (visites du même client sur le même bien) servi au personnel.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md).
- Le client lit ses propres réservations seulement (portée actuelle de l'index) ; `counts` lu par un client ne compte que les siennes ; `visits_on_property` n'est jamais servi au client.
- `counts` égale exactement les totaux de l'index filtré (même portée, mêmes filtres de portée).
- Codes d'erreur seulement.

## Delta à produire

- [ ] `filter[search]` (`AllowedFilter::callback` sur `Booking`).
- [ ] `BookingController::counts` + route `bookings/counts` (avant `bookings/{booking}`).
- [ ] `fields[customers]` étendus ; `visits_on_property` (sous-requête groupée).
- [ ] Tests : `BookingSearchFilterTest` (référence, nom, bien ; autre agence jamais), `BookingCountsTest` (égal aux 18 totaux de l'index, client ne compte que les siennes), `BookingCustomerFieldsTest` (téléphone servi au personnel, `visits_on_property` absent pour le client).

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — `filter[search]=Ousmane` rend la candidature d'Ousmane Ba et rien d'une autre agence.
- [ ] AC2 — `GET /api/bookings/counts` rend, pour chaque couple nature × statut, le `meta.total` de `GET /api/bookings?filter[kind]=…&filter[status]=…` (comparaison exhaustive dans le test).
- [ ] AC3 — Lue par le personnel, une réservation avec `include=customer` porte le téléphone du client et `visits_on_property` ; lue par le client, ni l'un ni l'autre de ces champs propres au personnel.
- [ ] Ablation consignée (AC2).

## Hors périmètre

- La nature, la saisie par l'agent (TCK-2579) ; les écrans (TCK-2594).
- La contre-offre.

## Notes d'implémentation

_(à remplir par implementing-specs)_
