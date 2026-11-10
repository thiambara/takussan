---
id: TCK-2579
title: "Une réservation porte sa nature, et l'agent saisit une candidature ou une offre pour un client"
status: todo
phase: P0
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2580, TCK-2591, TCK-2593, TCK-2594]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#nouveaux-enums"
tags: [back, bookings, crm, audit-ux, app, p0, adr]
---

## Objectif utilisateur

Quand un client dit à la sortie d'une visite « je prends » ou « je vous en offre 85 millions », l'agent l'enregistre depuis la console comme une candidature ou une offre à son nom, et le client en est prévenu.

## Contrat de données

**L'audit disait** que l'API acceptait déjà la saisie pour un client (`StoreBookingRequest.php:38`, `customer_id`). **Re-mesuré sur `1bce3798a`, c'est vrai pour un séjour seulement** :

- `customer_id` est bien accepté (`StoreBookingRequest.php:38`, sans `exists`) et contrôlé dans `BookingService::create` (`:91-101` : la fiche doit être vue par l'auteur et appartenir à l'agence du bien) ;
- mais `BookingQuote::for` refuse toute période autre que `daily`/`weekly` (422 `period_not_bookable`, `BookingQuote.php:75-81`) : **une candidature à une location au mois est impossible** par `/api/bookings` ;
- sur un bien à vendre, le total est forcé au prix affiché (`BookingService.php:167-189`) : **une offre à un autre montant est impossible** ;
- un membre du personnel qui omet `customer_id` crée une réservation **sans client** (branche `elseif (! $isStaff)`, `:102`) ;
- la nature n'est écrite nulle part de façon fiable : seule l'offre du tunnel public pose `metadata.kind = 'offer'` (`PublicPropertyController.php:1002-1007`), la candidature ne pose rien, et `metadata` n'est pas servi (`BookingResource.php:17-47`) ;
- le client n'est pas prévenu d'une réservation créée par le personnel (`NotifyOnBookingRequested.php:28` exclut client et auteur).

À créer (décision structurelle : [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md) « Une réservation porte sa nature ») :

- Migration `add_kind_to_bookings` : `kind` string(16) `BookingKind` (`stay`, `application`, `offer`), non nul après rattrapage ; rattrapage depuis le bien (`contract_type = sale` → `offer` ; `rent_period` `daily`/`weekly` → `stay` ; autre location → `application`) ; index `(agency_id, kind, status)`. `down()` réversible.
- Colonnes d'offre et de candidature : `offer_expires_at` (date, nullable), `list_price_at_booking` (decimal(14,2), nullable — le prix affiché au moment de l'offre ou de la candidature) ; la date d'entrée d'une candidature est `start_date`, `end_date` reste nul pour elle.
- Le tunnel public pose `kind` à l'écriture (séjour, candidature, offre) et continue d'écrire `metadata` comme aujourd'hui.
- `POST /api/bookings`, en mode personnel : champ `kind` ; pour `application` : `customer_id` requis, `start_date` (entrée) requise, `total_amount` = loyer proposé (défaut : le loyer du bien) ; pour `offer` : `customer_id` requis, `total_amount` = montant offert (libre, > 0), `offer_expires_at` facultatif ; pour `stay` : la règle actuelle (devis, nuits) inchangée.
- `BookingResource` : `kind`, `offer_expires_at`, `list_price_at_booking`, `created_by` (`{id, name}`) et `recorded_by_staff` (booléen : la demande a été saisie par le personnel pour le client).
- `filter[kind]` sur `GET /api/bookings`.

## Contraintes strictes (métier)

- **Lien d'abord, saisie possible (décision 9c)** : la saisie est un geste du personnel de l'agence du bien (`staffAgencyId() === property.agency_id`, ou super-admin) ; un client, un bailleur, un prestataire reçoivent 403. Pas de capacité nouvelle : la règle est celle de `BookingService::create` (`:64-65`), tenue dans `authorize()` (piège 2 de `takussan-api/CLAUDE.md`).
- **Toujours un client** : en mode personnel, `customer_id` devient **requis pour toutes les natures** (422 `booking.customer_required`) — la réservation sans client cesse d'exister par cette voie.
- La nature saisie doit être celle du bien (`application` sur un bien à vendre → 422 `booking.kind_mismatch`), sauf `stay` qui garde ses règles actuelles.
- Une candidature ou une offre ne bloque **aucune nuit** et ne passe pas par `PropertyAvailabilityService`.
- Statut à la création : `pending`, `expires_at` comme aujourd'hui (7 jours, ou `offer_expires_at` fin de journée de Dakar pour une offre — même règle que `FinInclusive` du tunnel public).
- **Le client est prévenu** qu'une demande a été enregistrée en son nom : notification `BookingRecordedOnBehalfNotification` par le canal de ses préférences s'il a un compte, sinon SMS au téléphone de la fiche (même mécanisme que `VisitNotifier::confirmed`), avec la référence et la possibilité d'annuler. L'auteur n'est pas notifié ; le bailleur et les agents du bien le restent (`NotifyOnBookingRequested`).
- Le montant reste décimal en base (principe n°3). Codes d'erreur seulement.

## Delta à produire

- [ ] Enum `BookingKind` ; migration `add_kind_to_bookings` (colonnes + rattrapage + index).
- [ ] `StoreBookingRequest` : `kind`, `offer_expires_at`, règles par nature ; `customer_id` requis en mode personnel.
- [ ] `BookingService::create` : branches `application` et `offer` sans `BookingQuote` ni contrôle de nuits ; `stay` inchangé.
- [ ] `PublicPropertyController::bookingRequest` : `kind` posé.
- [ ] `BookingResource`, `Booking::$queryFields` (`kind`, `offer_expires_at`, `list_price_at_booking`), `filter[kind]`.
- [ ] `BookingRecordedOnBehalfNotification` (+ SMS), écoutée sur `BookingRequested` quand l'auteur est du personnel.
- [ ] Tests : `StaffRecordsApplicationTest`, `StaffRecordsOfferTest` (montant libre ≠ prix affiché accepté, `list_price_at_booking` = prix affiché), `StaffBookingRequiresCustomerTest`, `BookingKindBackfillTest` (trois natures), `BookingKindFilterTest`, `BookingRecordedOnBehalfNotificationTest` (compte → notification ; sans compte → SMS ; auteur non notifié), `PublicBookingWritesKindTest`.

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — Un agent de l'agence poste `{kind: application, property_id: <location au mois>, customer_id, start_date: 2026-12-01}` : 201, `kind = application`, `status = pending`, `total_amount` = loyer du bien, `end_date = null`.
- [ ] AC2 (rouge sur `1bce3798a`) — `{kind: offer, total_amount: 85000000}` sur un bien affiché 95 000 000 : 201, `total_amount = 85000000.00`, `list_price_at_booking = 95000000.00`.
- [ ] AC3 (rouge sur `1bce3798a`) — Le même agent sans `customer_id` : 422 `booking.customer_required` ; **aucune** ligne créée.
- [ ] AC4 — Un client connecté poste `{kind: application}` sur `/api/bookings` pour un autre client : 403 ; le bailleur du bien : 403.
- [ ] AC5 — Après la migration, chaque réservation de la base de démo a un `kind` égal à celui que donne son bien (comparaison exhaustive dans le test de rattrapage).
- [ ] AC6 — Le client à compte reçoit `BookingRecordedOnBehalfNotification` ; le client sans compte reçoit un SMS ; l'agent auteur ne reçoit rien.
- [ ] AC7 — Une offre et une candidature déposées par le tunnel public portent `kind` `offer` et `application`.
- [ ] Ablations consignées (AC1, AC3, AC6).

## Hors périmètre

- Les écrans (TCK-2580 pour la saisie, TCK-2594 pour la liste et le détail).
- Les pièces du dossier, le garant, le score d'une candidature, la contre-offre : la page Réservations les montre dans la maquette, mais aucune donnée ne les porte ; ils attendent la bascule « trois pages » que la décision 2 de l'audit réserve au jour où la candidature prend un dossier.
- Recherche, compteurs par nature et par statut (TCK-2593).

## Notes d'implémentation

_(à remplir par implementing-specs)_
