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

_(à remplir par implementing-specs)_
