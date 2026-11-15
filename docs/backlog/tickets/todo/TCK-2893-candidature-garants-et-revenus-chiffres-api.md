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

**2026-11-15 — implémentation (agent délégué, vague 92).**

Ce qui est livré :
- Migrations `2026_11_15_289300_create_booking_guarantor_table` (pivot sans modèle, unique `(booking_id, guarantor_id)`,
  index `guarantor_id`) et `2026_11_15_289301_add_declared_monthly_income_to_bookings` (`text`, cast `encrypted`) ;
  `down()` : `drop`. Jouées sur la base de démo locale.
- `Booking::SENSITIVE = ['declared_monthly_income']` : `$hidden`, hors de `$queryFields` (`fields[bookings]=declared_monthly_income`
  → 400), et **hors du journal d'activité** (`Booking::getActivitylogOptions` : la règle d'`Auditable` + `logExcept`) —
  `Booking` est `Auditable` en `logFillable`, le journal aurait écrit la valeur déchiffrée (`PropertyRedactor` ne masque
  qu'à la lecture).
- Règle unique `BookingGuarantorService` (route et création) : verrou de la réservation puis du pivot, refus avant toute
  écriture (`booking.guarantor_not_for_kind` sur un séjour, `booking.dossier_closed` hors `pending`/`confirmed`,
  `booking.guarantor_already_attached`, `booking.max_guarantors`), fiche neuve créée dans la transaction avec l'agence de
  la réservation ; `addPieces`/`removePieces` de TCK-2872 (le dernier retiré seulement). `DELETE` d'un garant non
  rattaché : 404 `booking.guarantor_not_attached`.
- Garant facultatif à la création : `guarantor: {…}` (règles de `AttachBookingGuarantorRequest::fieldRules`) ; le
  personnel peut aussi donner `guarantor.guarantor_id`, **le tunnel public non** (`prohibited`). Un séjour : 422
  `booking.field_not_for_kind` (`BookingConditions::refuseForeignFields`), rien n'est créé.
- `declared_monthly_income` (`numeric`, `decimal:0,2`, 0 à 1e10) est un champ de la **candidature seule**
  (`BookingConditions::APPLICATION_INPUT`) : une offre ou un séjour qui l'envoie reçoit `booking.field_not_for_kind`.
- `BookingResource` : `has_guarantor`, `guarantors` (`id`, `first_name`, `last_name`, `relationship_to_tenant`),
  `declared_monthly_income_masked` (`Masking::presence`), `income_to_rent_ratio` — au seul personnel de l'agence
  (verdict de `BookingCustomerFacts::servesStaff`, rendu public), préparés par `BookingGuarantorFacts::prime` en deux
  requêtes par page, lues par ids (indépendant du sparse fieldset, sauf `agency_id` dont le verdict a besoin). Omises
  pour tout autre lecteur et dans la réponse 201 du tunnel.
- Rapport : `BookingConditions::incomeToRentRatio`, bcmath, arrondi au dixième demi au-dessus ; candidature seule, loyer > 0.
- Lecture en clair : `GET /api/bookings/{booking}/sensitive` → `{id, declared_monthly_income}`, `BookingPolicy::viewSensitive`
  (admin de l'agence de la réservation ; super-admin par `Gate::before`), `ProtectedActions::STEP_UP`, surface
  `booking_sensitive` rattachée à l'agence.
- Export du droit d'accès : le candidat reçoit son revenu en clair dans **sa** ligne (`makeVisible`) ; bailleur et auteur
  ne l'ont pas (`$hidden`).

Décisions prises (à relire) :
- **Qui rattache / retire** : `BookingPolicy::manageGuarantors` = la règle du dépôt d'une pièce (le client de la
  réservation ou le personnel de l'agence du bien) ; le client ne relit pourtant pas la liste (personnel seul, contrat).
- Un garant d'une **offre** ajoute aussi les deux pièces du garant au dossier (le ticket admet le garant sur une offre).
- Réservation close : réutilise le code `booking.dossier_closed` (le garant fait partie du dossier, ADR-0110 § 2).

Écarts à la prémisse :
- La route de lecture en clair n'est pas dans « Routes neuves » mais dans le contrat (« la lecture dédiée d'ADR-0070
  étendue ») : posée.
- `DateInventoryByValueTest` : les quatre clés neuves inscrites (bloc TCK-2893) ; le test est vert.

Tests : `BookingGuarantorTest` (8), `BookingIncomeEncryptionTest` (8), `BookingGuarantorAccessTest` (2),
`BackupVerifyEncryptionTest` (+1), `ImpersonationReadSweepTest` (la réservation de la cible porte le revenu de garde et la
caution ; témoin du masque). Dix-sept ablations une à une, toutes rouges puis restaurées (md5), dont la règle « même
agence » sur `guarantor_id`. Gardes jouées, vertes : les trois d'architecture, `LangGroupParityTest`,
`ProtectedActionsCoverageTest`, `ImpersonationReadOnlyTest`, `ValeursEnListeParcoursDesRoutesTest`,
`DateInventoryByValueTest`, `AmountRepresentationTest`, `DateRepresentationTest`, `ModelsTest`, et les classes
voisines non modifiées (`BookingConditionsTest`, `BookingDossierTest`, `BookingResourceContractTest`,
`BookingCustomerFieldsTest`, `StaffRecordsOfferTest`, `ArchiveDuTitulaireTest`, `CustomerAndGuarantorSensitiveReadTest`).
Verrous : bien (création) → réservation → pivot/garants ; personne ne prend un garant puis une réservation.

Reste :
- `takussan-web` : le code `booking.field_not_for_kind` et les quatre codes neufs (`booking.guarantor_*`,
  `booking.max_guarantors`) n'ont pas de traduction dans le front ; `types/booking.ts` ne porte pas les clés neuves —
  TCK-2875/2878.
- Une fiche de garant supprimée (douce) encore rattachée à une demande ouverte laisse ses deux pièces attendues :
  `GuarantorController::destroy` ne garde que les baux.
- **Une réservation sans agence** (bien d'un bailleur direct) peut recevoir un revenu et un garant par le tunnel, mais
  n'a aucun lecteur des faits (`servesStaff`) ni du clair (`viewSensitive`) hors super-admin — à trancher par le porteur.
- `docs/models-spec.md` : la colonne `bookings.declared_monthly_income` et le pivot `booking_guarantor` (aucun modèle neuf).
