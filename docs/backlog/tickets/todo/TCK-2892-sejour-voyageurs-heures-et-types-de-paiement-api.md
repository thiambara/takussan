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

**Re-mesure (2026-11-15)** — TCK-2870 n'avait posé ni `bookings.guests` ni les heures du bien : les trois volets sont faits ici. `metadata.guests` était écrit par les deux chemins et lu par la seule migration de rattrapage de la nature (TCK-2579).

**Voyageurs (AC1)**
- Migration `2026_11_15_289200_add_guests_to_bookings` : `smallint` nullable ; rattrapage des **seuls séjours** (`kind = 'stay'`) depuis `metadata->>'guests'` filtré par `^[1-9][0-9]{0,3}$` (une valeur illisible ne fait pas avorter la transaction). `metadata.guests` reste écrit (précédent TCK-2579, `down()` sans perte) et n'est plus lu.
- Écrit en colonne par `BookingService::create` et par `PublicPropertyController::bookingRequest` (séjour seul) ; servi par `BookingResource` (`lue()`), `Booking::$queryFields`.
- Hors séjour : `BookingConditions::refuseForeignFields` rend 422 `booking.field_not_for_kind` — au tunnel public, `guests` n'est plus exigé que d'un séjour (`requiredIf` sur la nature du bien), et l'offre a reçu une règle `guests` pour que `validated()` ne l'efface pas en silence. La saisie du personnel garde `prohibitedIf($recorded)` (422 de validation, `StaffRecordsApplicationTest`).
- **Écart de prémisse** : le tunnel public EXIGEAIT `guests` de toute location, candidature comprise, et `PropertyReservationDialog` l'envoyait toujours. Corrigé : la boîte ne montre ni n'envoie le nombre hors séjour (test `PropertyReservationDialog.voyageurs.tck-2892`), `BookingRequestPayload.guests` optionnel ; dix fichiers de test qui postaient `guests` sur une candidature ont perdu la clé.

**Heures (AC2)** — Migration `2026_11_15_289201_add_check_in_hours_to_properties` (`time` nullables, aucun défaut). `App\Services\Property\HeuresDuSejour` : `date_format:H:i`, INTERDITES hors location à la nuit ou à la semaine (comme `CoutDEntree`), jugées à la modification sur le contrat et la période qui résulteront ; servies `HH:MM` (`15:00:00` → `15:00`). Invariant `saving` du modèle : un bien qui quitte le séjour perd ses heures (seulement quand le contrat est lu). La duplication les copie (`replicate`).

**Paiements (AC3)** — `BookingPaymentType::SecurityDeposit`, `::Other` ; `notes` exigé pour `other`. Défauts voisins corrigés : la borne `exceeds_remaining` s'appliquait à tout type hors `fee` (une caution sur un séjour réglé était refusée) → seuls `deposit`/`advance` (`reglantLeTotal()`) ; `dueFromCustomer` déduisait toute ligne payée → caution et « autre » n'y comptent plus. Le reçu PDF imprimait la valeur brute (`deposit`) → libellé `bookings.payment_types.*` (fr/en/wo), en français comme le gabarit.
- Front : unions `BookingPaymentType`, `payment_type` de la saisie, `Booking.guests`, `PropertyDetail.check_in_from/check_out_before`, libellés `bookings.paymentType.security_deposit|other`, `admin.finances.argent.periode.reservation.security_deposit`. La boîte de saisie (`BookingPaymentDialog`) n'offre pas encore les deux types : c'est l'écran de TCK-2877.
- `BookingResourceContractTest` : `guests` ajouté, et `source` (servi depuis TCK-2874, absent du contrat — le test était rouge).

**Reste (fichier tenu par TCK-2865, en cours)** : `CollectedPayments::bookingIncome()` compte TOUT paiement de réservation payé comme encaissé ; la caution d'un séjour (`security_deposit`) est de l'argent détenu, à exclure comme la caution de bail (`DEPOSIT_TYPES`). Point unique : `AgencyDetailController` et `FinanceSummaryService` passent par lui. Relus sans défaut : `PayoutCalculator` (acompte et solde seuls), `BookingRefundTaskService` (une caution payée se rembourse bien à la fermeture), `PlatformPayoutService`, `PaymentHistory`. Seeders et factories n'écrivent aucun `guests`.

**Ablations** (une à une, restauration par `cp` + md5) : refus hors séjour, écriture de la colonne (tunnel et personnel), rattrapage, interdiction des heures hors séjour, invariant du modèle, format `HH:MM`, borne du reste dû, `dueFromCustomer`, note exigée, libellé du reçu, envoi conditionnel du front — chacune rougit son test.
