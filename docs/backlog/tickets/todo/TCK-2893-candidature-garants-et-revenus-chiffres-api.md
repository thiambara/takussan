---
id: TCK-2893
title: "API : les garants d'une candidature (pivot vers les garants existants, leurs pièces au dossier) et les revenus du candidat, chiffrés, servis en rapport au loyer"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2872]
blocks: [TCK-2875, TCK-2878, TCK-2894]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#27-guarantor-"
tags: [back, bookings, candidature, guarantors, adr-0070, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent sait si un candidat a un garant et si ses revenus tiennent le loyer, sans que le montant de ses revenus circule en clair.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e1 « Revenus 950 000 F/mois · Garant : oui », carte Décision « Revenus de 3,2 fois le loyer, garant déclaré » ; app-fil-commercial e6, e7 « Garant : Oui · Ibrahima Dieng, son frère »). ADR-0102 laissait le garant hors modèle ; [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 3 et § 4 le font entrer, en réutilisant la table `guarantors` (protégée par [ADR-0070](../../../adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md)).

## Contrat de données

- Pivot `booking_guarantor` ; colonne `bookings.declared_monthly_income` (chiffrée).
- Routes neuves : `POST /api/bookings/{booking}/guarantors` (garant existant ou créé à la volée, champs de `StoreGuarantorRequest`), `DELETE /api/bookings/{booking}/guarantors/{guarantor}`.
- `BookingResource` (personnel de l'agence du bien seul) : `has_guarantor`, `guarantors` (nom, lien), `income_to_rent_ratio`, `declared_monthly_income_masked`.
- Lecture en clair du revenu : la lecture dédiée d'ADR-0070 (step-up, journalisée), étendue à cette colonne.

## Contraintes strictes (métier)

- [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 3, § 4 ; [ADR-0070](../../../adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md).
- Trois garants au plus par réservation (comme le bail), sur une candidature ou une offre seulement.
- Rattacher un garant ajoute `guarantor_commitment` et `guarantor_identity` au dossier (`BookingDossierService::addPieces`, TCK-2872) ; le dernier retiré les retire si elles ne sont pas reçues.
- Le revenu n'est **jamais** servi en clair par `BookingResource` ; le rapport au loyer est arrondi au dixième ; ni l'un ni l'autre au client d'une autre réservation.
- Un autre candidat au même bien ne lit ni le garant ni le revenu.

## Delta à produire

- [ ] Migrations `create_booking_guarantor_table` (unique `(booking_id, guarantor_id)`), `add_declared_monthly_income_to_bookings` (text, cast `encrypted`) ; `down()`.
- [ ] `Booking::guarantors()` ; `BookingGuarantorController` ; `AttachBookingGuarantorRequest` ; routes.
- [ ] `StoreBookingRequest` et tunnel public : `declared_monthly_income` (numeric, min 0, max 1e10), garant facultatif.
- [ ] `BookingResource` : champs ci-dessus ; `ImpersonationReadSweepTest` : revenu masqué ; `backup:verify-encryption` voit la colonne par son cast.
- [ ] Tests : `BookingGuarantorTest` (rattacher, créer à la volée, 3 au plus, pièces ajoutées puis retirées), `BookingIncomeEncryptionTest` (chiffré en base, masqué, ratio au dixième, absent pour un autre client), `BookingGuarantorAccessTest`.

## Critères d'acceptation

- [ ] AC1 — Rattacher un garant à une candidature qui attendait trois pièces en fait attendre cinq ; le retirer avant réception revient à trois.
- [ ] AC2 — `declared_monthly_income = 950000` sur un loyer de 300 000 F : la base contient un chiffré, la ressource rend `income_to_rent_ratio = 3.2` et un montant masqué, jamais `950000`.
- [ ] AC3 — Un quatrième garant rend 422 ; un garant sur un séjour rend 422.
- [ ] AC4 — Un autre candidat au même bien ne reçoit ni `guarantors` ni `income_to_rent_ratio`.

## Hors périmètre

- La reprise des garants dans le bail (TCK-2894) ; les écrans (TCK-2875, TCK-2878).

## Notes d'implémentation

_(à remplir par implementing-specs)_
