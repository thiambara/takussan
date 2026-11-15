---
id: TCK-2872
title: "API : le dossier d'une candidature ou d'une offre — pièces attendues, reçues, demandées, déposées par le client ou l'agence"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2875, TCK-2878, TCK-2879, TCK-2893]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#22-document-"
tags: [back, bookings, candidature, documents, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent voit d'un coup d'œil si le dossier d'un candidat est complet (« 3/4 pièces »), ouvre ce qui est arrivé et réclame ce qui manque en un geste ; le candidat sait ce qu'il lui reste à fournir et le dépose.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e0 colonne « Dossier », e1, e3, e9 « Compléter mon dossier » ; app-fil-commercial e6, e7). ADR-0102 § Conséquences laissait les pièces **hors modèle** ; le porteur veut tout : [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 2 les y fait entrer. Maquette des pièces : `app-reservations-pieces.tsx:239-265` (`PIECES_OUSMANE`, « Ouvrir », « Demander »). Le détail n'est pas dans `docs/models-spec.md` : à reporter par `/sync-specs`.

## Contrat de données

- Table fille `booking_dossier_items` (ADR-0110 § 2).
- Routes neuves :
  - `GET /api/bookings/{booking}/dossier` — les pièces (attendue, reçue, demandée le), le document de chacune ;
  - `POST /api/bookings/{booking}/dossier/{piece}/document` — dépôt d'une pièce (client de la réservation, ou personnel de l'agence du bien), multipart, 10 Mo ;
  - `POST /api/bookings/{booking}/dossier/{piece}/request` — « Demander » (personnel de l'agence du bien).
- `BookingResource` : `dossier: { received, required, missing: [piece] }`, servi **au client de la réservation et au personnel de l'agence du bien** (le client en a besoin pour « Compléter mon dossier »), une requête pour la page.
- Notification `booking.dossier_piece_requested` (ADR-0032).
- `BookingDossierService::addPieces` / `removePieces` : points d'entrée que TCK-2893 appelle quand un garant est rattaché ou retiré.

## Contraintes strictes (métier)

- [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 2 ; [ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md) (la liste suit la lecture).
- Liste des pièces **fixe par nature**, posée à la création (candidature : `identity`, `payslips`, `employment_certificate` ; offre : `identity`, `proof_of_funds`).
- **Aucun autre candidat** du même bien ne lit une pièce d'une autre réservation (politique et liste).
- « Demander » : au plus une fois par pièce et par 24 h (429 `booking.dossier_request_throttled`), jamais pour une pièce reçue (422).
- Un séjour n'a pas de dossier (404 sur les routes).
- Dépôt : types acceptés ceux de `DocumentUploadDialog` (PDF, JPEG, PNG, HEIC), 10 Mo.
- Une réservation fermée (refusée, annulée, expirée) garde son dossier lisible, n'accepte plus de dépôt (422).

## Delta à produire

- [ ] Migration `create_booking_dossier_items_table` (`booking_id` FK cascade, `piece` string, `required` bool, `document_id` FK nullable `documents` nullOnDelete, `requested_at`, `requested_by_id`, `received_at`, unique `(booking_id, piece)`) ; `down()`.
- [ ] Enum `DossierPiece` (`identity`, `payslips`, `employment_certificate`, `guarantor_commitment`, `guarantor_identity`, `proof_of_funds`, `other`) ; modèle `BookingDossierItem` ; `Booking::dossierItems()`.
- [ ] `BookingDossierService` : pose de la liste à la création (`BookingService::create`, les deux voies), `addPieces` / `removePieces` (une pièce reçue n'est jamais retirée), dépôt (crée un `Document` `documentable` = réservation, pose `received_at`), demande (notification, borne).
- [ ] `DocumentPolicy::reaches` et la liste d'ADR-0099 : cible `booking` (client de la réservation, personnel de l'agence du bien, bailleur direct).
- [ ] `BookingDossierController` (`index`, `upload`, `request`) ; `UploadBookingDossierPieceRequest`, `RequestBookingDossierPieceRequest` ; routes dans `routes/api/bookings.php`.
- [ ] `NotificationCode::BookingDossierPieceRequested` (type `Booking`), textes `fr`/`en`/`wo`.
- [ ] Tests : `BookingDossierTest` (liste par nature, complétude, dépôt client et personnel, 404 séjour, 422 fermée), `BookingDossierAccessTest` (un autre candidat du même bien : 403 sur la pièce, absente de `GET /api/documents`), `BookingDossierRequestTest` (notification, 429 en 24 h, 422 reçue).

## Critères d'acceptation

- [ ] AC1 — Une candidature créée attend trois pièces ; `dossier` rend `{ received: 0, required: 3, missing: [identity, payslips, employment_certificate] }` au personnel **et** au client de la réservation.
- [ ] AC2 — Le client dépose sa pièce d'identité : `received` passe à 1, la pièce est un `Document` qu'il ouvre et que le personnel de l'agence ouvre ; un autre candidat au même bien reçoit 403 et ne la voit pas dans `GET /api/documents`.
- [ ] AC3 — « Demander » l'attestation de travail envoie `booking.dossier_piece_requested` au client ; un second appel dans les 24 h rend 429.
- [ ] AC4 — Les routes de dossier d'un séjour rendent 404 ; un dépôt sur une candidature refusée rend 422.

## Hors périmètre

- Garants et revenus (TCK-2893) ; les écrans (TCK-2875, TCK-2878, TCK-2879) ; une liste de pièces configurable par agence (ADR-0110, hors modèle).

## Notes d'implémentation

_(à remplir par implementing-specs)_
