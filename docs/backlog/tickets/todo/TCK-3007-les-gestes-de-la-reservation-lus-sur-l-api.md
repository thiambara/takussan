---
id: TCK-3007
title: "Les gestes de la réservation lus sur l'API : abilities complètes (policy et état), fonction pure côté fiche, le Bailleur retrouve Accepter/Refuser/Annuler"
status: todo
phase: P2
family: full
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: []
blocks: [TCK-3006]
spec_refs:
  features: ["docs/features.md#13-réservations-courte-durée--visites"]
  models: []
tags: [back, front, reservations, gestes, bailleur, architecture, adr-0139]
---

## Objectif utilisateur

Le Bailleur, l'agent et le client voient sur la fiche d'une réservation exactement les gestes que l'API leur permettra.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7), vérifié :

- `BookingResource::avecGestes` / `gestes()` (~:162-190) calcule `confirm`, `reject`, `cancel` ; `BookingController::presenter` (:242) le pose pour `show`, `confirm`, `cancel`, `reject` et la contre-offre. `src/types/booking.ts` n'a pas `abilities` (seul `can_refund`).
- `BookingDetail.tsx` (~1 249 l., :266-289) recalcule par `useCanAll` + statut + `clientPeutAnnuler`, sans `agencyId` (agence active au lieu de celle de la réservation), et affiche les boutons pendant le chargement (`staffMay` optimiste).
- **Bailleur** : `SystemRoleCapabilities::owner()` ne donne que `PropertiesUpdateOwn` ; `BookingPolicy::validate` et `cancel` admettent `landlordOf` : la fiche lui cache Accepter, Refuser, Annuler.
- **Encaisser** : le front exige `payments.record` et `confirmed` ; l'API (`BookingMoneyAccess::canRecordAsCollector`, `AuthorizesTransitionally::canManageBooking`) n'exige aucune capacité et accepte `pending|confirmed|completed` (`Booking.php:127`).

## Contraintes strictes (métier)

- ADR-0139. Gestes servis : `confirm`, `reject`, `cancel`, `counter_offer`, `answer_counter_offer`, `record_payment`, `refund` (remplace `can_refund`, gardé en alias le temps du front), `create_lease`, `pay`, `upload_dossier_piece`, `request_dossier_piece`, `manage_guarantors`, `leave_review`.
- **Encaisser exige `payments.record` côté API** (ADR-0003 : un geste d'argent est une capacité), pour le personnel ; les statuts admis restent ceux de l'API.
- Un seul chemin d'écriture par geste : le module juge, `BookingService` écrit.
- Les natures (ADR-0102 : `stay`, `application`, `offer`) se jugent à l'API.

## Delta à produire

- [ ] Service : `App\Services\Booking\GestesDeLaReservation` — un `peut<Geste>(User, Booking)` par geste, réutilisé par `BookingService` avant écriture et par `BookingResource::gestes`
- [ ] `BookingMoneyAccess` : `payments.record` exigé pour l'encaissement par le personnel
- [ ] `src/types/booking.ts` : `BookingAbilities`
- [ ] Front : fonction pure des gestes de la fiche réservation (patron `components/leases/fiche/gestes.ts`) ; `BookingDetail` ne lit plus `useCanAll` ni le statut pour décider ; aucun geste tant qu'`abilities` manque
- [ ] Tests API : `tests/Feature/Api/BookingGestesTest.php` (chaque clé vraie et fausse ; Bailleur ; encaissement sans `payments.record` → 403) ; tests front de la fonction pure, en remplacement des tests de règle par rendu (`capabilities`, `sejour-commence`, `jour-de-l-api.*`, `creer-le-bail`)

## Critères d'acceptation

- [ ] AC1 — Le Bailleur d'un bien voit Accepter, Refuser et Annuler sur une réservation `pending` de son bien, et l'API les accepte (test API + test de la fonction pure).
- [ ] AC2 — `POST` d'encaissement par un membre du personnel sans `payments.record` rend 403.
- [ ] AC3 — `grep -n "useCanAll\|staffMay" src/components/bookings/BookingDetail.tsx` est vide.
- [ ] AC4 — Pendant le chargement, la fiche n'affiche aucun bouton de geste.

## Hors périmètre

- Les listes de réservations (`MesReservations`) : pas d'`abilities` en liste (ADR-0139 § 5).

## Notes d'implémentation
