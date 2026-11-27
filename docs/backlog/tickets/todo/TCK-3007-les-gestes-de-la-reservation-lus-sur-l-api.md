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

- [x] Service : `App\Services\Booking\GestesDeLaReservation` — un `peut<Geste>(User, Booking)` par geste, réutilisé par `BookingService` avant écriture et par `BookingResource::gestes`
- [x] `BookingMoneyAccess` : `payments.record` exigé pour l'encaissement par le personnel
- [x] `src/types/booking.ts` : `BookingAbilities`
- [x] Front : fonction pure des gestes de la fiche réservation (patron `components/leases/fiche/gestes.ts`) ; `BookingDetail` ne lit plus `useCanAll` ni le statut pour décider ; aucun geste tant qu'`abilities` manque
- [x] Tests API : `tests/Feature/Api/BookingGestesTest.php` (chaque clé vraie et fausse ; Bailleur ; encaissement sans `payments.record` → 403) ; tests front de la fonction pure, en remplacement des tests de règle par rendu (`capabilities`, `sejour-commence`, `jour-de-l-api.*`, `creer-le-bail`)

## Critères d'acceptation

- [x] AC1 — Le Bailleur d'un bien voit Accepter, Refuser et Annuler sur une réservation `pending` de son bien, et l'API les accepte (test API + test de la fonction pure).
- [x] AC2 — `POST` d'encaissement par un membre du personnel sans `payments.record` rend 403.
- [x] AC3 — `grep -n "useCanAll\|staffMay" src/components/bookings/BookingDetail.tsx` est vide.
- [x] AC4 — Pendant le chargement, la fiche n'affiche aucun bouton de geste.

## Hors périmètre

- Les listes de réservations (`MesReservations`) : pas d'`abilities` en liste (ADR-0139 § 5).

## Notes d'implémentation

Re-mesure du 2026-11-27 (arbre `feat/approfondissements-architecture`), avant tout changement :

- **Bailleur** : confirmé. `SystemRoleCapabilities::owner()` = `[PropertiesUpdateOwn]` ; `BookingPolicy::validate` et `cancel` admettent `landlordOf` ; la fiche exigeait `bookings.validate` / `bookings.cancel` par `useCanAll`. L'API lui servait déjà `abilities.confirm/reject/cancel` vrais : le défaut était côté fiche.
- **Encaissement** : confirmé. `canRecordAsCollector` n'exigeait aucune capacité (rouge du test 403 constaté avant le correctif) ; statuts `Booking::STAFF_PAYABLE_STATUSES` inchangés.
- **Agence active** : confirmé (`useCanAll` sans `agencyId`). **Chargement** : confirmé (`staffMay` rendait vrai tant que `capabilitiesLoading`).

Ce qui a été fait, et ce qui diffère du ticket :

- `App\Services\Booking\GestesDeLaReservation` : `pour(User, Booking)` (13 clés, ordre `GESTES`) et un `peut<Geste>` par geste, qui compose la policy (`BookingPolicy`, `BookingMoneyAccess`, `LeasePolicy::createOn`) avec l'état. Les prédicats d'état (`decidable`, `annulable`, `contreProposable`, `dossierOuvert`, `STATUTS_DU_DOSSIER_OUVERT`) sont relus SOUS VERROU par `BookingService::confirm/reject/cancel`, `BookingCounterOfferService::propose`, `BookingGuarantorService` et `BookingDossierService` : une seule définition par règle d'état. `BookingService::TERMINAL_CANCEL_STATUSES` est supprimée (sans appelant) ; le docblock de `CompleteEndedBookingsJob` renvoie à `GestesDeLaReservation::annulable`.
- `estLePayeurClient` vit dans le module ; `StoreBookingPaymentRequest::payeurClient` y délègue.
- **`can_refund` est retiré de l'API**, pas gardé en alias : la fiche (et `BookingRefundPanel`) en était le seul lecteur. `abilities.refund` = `canRefund` ET un paiement `paid` à rendre.
- `create_lease` suit `LeasePolicy::createOn` : le Bailleur du bien le reçoit aussi (la fiche le lui cachait derrière `leases.create`).
- `pay` exige un séjour (`kind = stay`) : la nature se juge à l'API (ADR-0102) ; la règle n'existait qu'au navigateur. Le reste dû est lu par `BookingPaymentService::aRegler` (neuve, `null` quand rien n'est dû), que `dueFromCustomer` enveloppe désormais pour le 422 `booking_payment.nothing_due` : une seule règle du dû.
- Front : `components/bookings/detail/gestes.ts` (`gestesDeLaReservation`, `AUCUN_GESTE`, et `paiementsRemboursables` / `plafondDuRemboursement` déplacés depuis `BookingRefundPanel`). `PiecesDuDossier` prend `demander` / `deposer` (gestes) à la place de `client` ; `personnel` n'y garde que la lecture « Ouvrir ».
- Tests supprimés (règle seule, désormais à l'API et en fonction pure) : `BookingDetail.capabilities`, `.sejour-commence.tck-1301`, `.jour-de-l-api.{paris,new-york}.p212-02`, `.creer-le-bail.p48-03` (le rendu de « Créer le bail » reste éprouvé par `.bail-repris.tck-2878`). `BookingGestesDuLecteurTest` (API) est absorbé par `BookingGestesTest`. Les tests de rendu reçoivent leurs `abilities` de `__tests__/abilities-de-test.ts` (`permis`, `gestesServis`).
- Ablation rejouée : `canRecordAsCollector` sans `payments.record` → 2 rouges dans `BookingGestesTest` (dont le 403), restauré (md5 vérifié).
- `canBookingLeaveReview` (`components/reviews/reviewEligibility.ts`) et son test sont retirés : la fiche était son seul appelant ; `canLeaseLeaveReview` reste (`LeaseDetail`).
