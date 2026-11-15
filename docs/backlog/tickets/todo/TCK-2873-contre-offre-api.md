---
id: TCK-2873
title: "API : contre-proposer un prix sur une offre d'achat, que le client accepte ou décline"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2876, TCK-2879]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, offre, negociation, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Devant une offre trop basse, l'agent propose un autre prix au lieu de refuser ; le client répond d'un geste, et une contre-offre acceptée conclut l'offre.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e4 : « Contre-proposer » dans la barre du téléphone, l'en-tête et la carte « Décision » du bureau, `app-reservations-a.tsx:518, 980, 1018`). ADR-0102 laissait la contre-offre hors modèle, sans route ni statut ; le porteur veut tout : [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 5. La maquette ne dessine pas la feuille de saisie : son contenu (montant, message, validité) est la décision d'ADR-0110. Non détaillé dans `docs/features.md` : à reporter par `/sync-specs`.

## Contrat de données

- Table fille `booking_counter_offers` (ADR-0110 § 5).
- Routes neuves :
  - `POST /api/bookings/{booking}/counter-offers` (personnel de l'agence du bien, capacité de décision des réservations) : `amount`, `message` (≤ 500, facultatif), `valid_until` (date, défaut J+3, au plus J+30) ;
  - `POST /api/bookings/{booking}/counter-offers/{counterOffer}/accept` et `/decline` (client de la réservation).
- `BookingResource` : `counter_offer` (la dernière, `amount`, `message`, `valid_until`, `status`) et `awaiting` (`agency` | `customer`).
- Notifications `booking.counter_offer_received` (client) et `booking.counter_offer_answered` (agence, paramètre `answer`).

## Contraintes strictes (métier)

- [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 5 ; [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md) (statuts inchangés).
- Seulement sur une **offre** (`kind = offer`) `pending` : 422 `booking.counter_offer_not_allowed` sinon.
- Une nouvelle contre-offre passe la précédente `pending` en `superseded`.
- Accepter : la contre-offre doit être `pending` et non échue, sur la réservation du client appelant ; `total_amount` prend son montant, la réservation passe `confirmed` par le chemin d'acceptation existant (mêmes effets : notifications, autres offres du bien). Décliner : l'offre reste `pending` à son montant d'origine.
- L'expiration passe `expired` par la tâche d'expiration des réservations (`BookingExpirationService`), sans toucher à l'offre.
- Montant XOF entier, > 0 (ADR principe 3).

## Delta à produire

- [ ] Migration `create_booking_counter_offers_table` ; enum `CounterOfferStatus` ; modèle `BookingCounterOffer` ; `Booking::counterOffers()`.
- [ ] `BookingCounterOfferService` (`propose`, `accept`, `decline`, `expire`) en transaction avec verrou sur la réservation.
- [ ] `BookingCounterOfferController` ; `StoreBookingCounterOfferRequest`, `AnswerBookingCounterOfferRequest` ; routes.
- [ ] `BookingResource` : `counter_offer`, `awaiting`.
- [ ] Codes de notification et textes `fr`/`en`/`wo`.
- [ ] Entrée au journal de la réservation (historique de l'écran).
- [ ] Tests `BookingCounterOfferTest` : proposée → reçue par le client ; acceptée → `confirmed` au nouveau montant ; déclinée → `pending` au montant d'origine ; remplacée ; échue → `expired` et acceptation 422 ; 422 sur une candidature ou un séjour ; 403 pour un autre client.

## Critères d'acceptation

- [ ] AC1 — Sur une offre de 85 000 000 F, l'agent contre-propose 90 000 000 F : le client reçoit `booking.counter_offer_received`, la réservation rend `awaiting = customer`, `status = pending`.
- [ ] AC2 — Le client accepte : `status = confirmed`, `total_amount = 90000000`, l'agence reçoit `booking.counter_offer_answered` (`accepted`).
- [ ] AC3 — Le client décline : `status = pending`, `total_amount = 85000000`, `awaiting = agency`.
- [ ] AC4 — Contre-proposer sur une candidature rend 422 `booking.counter_offer_not_allowed`.
- [ ] AC5 — Une contre-offre au `valid_until` passé est `expired` après la tâche, et son acceptation rend 422.

## Hors périmètre

- La contre-offre sur une candidature (loyer) : la maquette ne la montre que sur l'offre.
- Les écrans (TCK-2876 personnel, TCK-2879 client).

## Notes d'implémentation

2026-11-15 — agent d'implémentation.

**Livré.** Table `booking_counter_offers` (migration `2026_11_15_287300`), enum `CounterOfferStatus`, modèle
`BookingCounterOffer`, `Booking::counterOffers()` et `latestCounterOffer()` (latestOfMany, chargée par l'index
et la présentation : pas de N+1). `BookingCounterOfferService` (`propose`, `accept`, `decline`, `expire`), en
transaction sous verrou : `accept` verrouille le bien puis la réservation (l'ordre de `BookingService::confirm`),
écrit `total_amount` puis appelle `BookingService::confirm()` — mêmes gardes et même avis `booking.confirmed`.
Routes `POST bookings/{booking}/counter-offers` et `…/{counterOffer}/accept|decline` (`scopeBindings` + relecture
filtrée par `booking_id` : une contre-offre d'une autre réservation rend 404). `BookingResource` : `counter_offer`
(`id`, `amount`, `message`, `valid_until`, `status`, `created_at`, `responded_at`) et `awaiting`
(`customer`|`agency`|`null` hors `pending`). Notifications `booking.counter_offer_received` (client, SMS court) et
`booking.counter_offer_answered` (équipe de la réservation `BookingStakeholders` moins le client, plus l'auteur de
la contre-offre ; paramètre `answer` de nature neuve `counter_offer_answer`, traduite sous
`bookings.counter_offer_answers`). Journal de la réservation : `counter_offer_proposed|accepted|declined|expired`
(libellés `admin.audit.events.*`). Expiration : `BookingExpirationService::expireCounterOffers()`, appelée par
`ExpireBookings` (horaire). Fil de la fiche client : jalon `counter_offer` (rang 11 réservé par TCK-2894), une
entrée par contre-offre, `id` = la réservation, avec `counter_offer {id, amount, valid_until, status}`.

**Choix.**
- Contre-proposer : personnel de l'agence sous `bookings.validate` (`BookingPolicy::proposeCounterOffer`) ; le
  bailleur, que `validate()` admet, n'est PAS admis (le ticket nomme le personnel).
- Répondre : le client de la réservation seul (`answerCounterOffer`) ; le super-admin passe par `Gate::before`.
- `valid_until` : un JOUR (Dakar), d'aujourd'hui à J+30, défaut J+3 ; valable jusqu'à 23:59:59 à Dakar
  (`FinInclusive`). Une contre-offre `pending` échue est refusée à l'acceptation (422
  `booking.counter_offer_expired`) AVANT le passage de la tâche, et se lit déjà `expired` dans la ressource.
- Codes d'erreur : `booking.counter_offer_not_allowed`, `booking.counter_offer_expired`, `booking.counter_offer_not_open`.

**Prémisse qui différait.** « Mêmes effets : … autres offres du bien » : `BookingService::confirm()` n'a aucun
effet sur les autres offres du bien (`assertNoOtherAcceptedApplication` exclut les offres). Rien n'est fait de plus.

**Reste.**
- `BookingCounterOffer` absent de `docs/models-spec.md` (`check-models-spec` rouge) : `/sync-specs`.
- Le 48 h de l'agence (`booking_pending_expiry_hours`) et `expires_at` peuvent expirer l'OFFRE pendant une
  contre-offre ouverte (J+3 par défaut) ; l'agence peut aussi confirmer ou refuser directement pendant une
  contre-offre (elle reste alors `pending` en base, `awaiting` = null). Non tranché ici.
- Front (TCK-2876/2879, et TCK-2878 pour le fil) : le type `milestone` du fil (`customer-timeline.ts`) ne connaît
  pas `counter_offer` ; deux contre-offres d'une même réservation y ont le même `id` (la réservation) — clé React à
  composer avec `counter_offer.id`. `CounterOfferStatus` classé `SANS_UNION`/`SANS_LIBELLE` en attendant.

**Mesures.** `BookingCounterOfferTest` (10), `CustomerTimelineCounterOfferTest` (2), `FormeDesDatesDeNotificationTest`
(+1) verts ; ablations rouges une à une (remplacement, montant, échéance, tâche, nature, politique, `awaiting`, fil).
