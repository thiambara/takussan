---
id: TCK-1301
title: "Réservations : un séjour fini passe `completed`, un séjour commencé ne s'annule plus"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-115--statuts-denum-quaucun-chemin-de-app-nécrit"
tags: [api, front, booking, scheduler, pistes]
---

## Contexte

Réf : **P115.01** du fichier de pistes, `validé` par le porteur.

Rien n'écrit `BookingStatus::Completed` : une réservation `confirmed` le reste après son séjour,
et `cancel()` ne lit aucune date. Mesuré : réservation `confirmed` du J-10 au J-3, acompte `paid`,
`POST /api/bookings/{id}/cancel` par le client → 200, `cancelled`, une tâche `booking_refund`.

## Décision du porteur

porteur (2026-10-22) : une tâche quotidienne passe `completed` les réservations `confirmed` dont `end_date` est passée, et `cancel()` refuse l'annulation d'un séjour commencé (bouton caché au front)

## Objectif

Un séjour mené se clôt seul et ne s'annule plus ; l'acompte d'un séjour commencé n'ouvre plus de
tâche de remboursement par une annulation.

## Delta à produire

- [x] Job `App\Jobs\Booking\CompleteEndedBookingsJob` : `confirmed` et `end_date < aujourd'hui` →
      `completed`, sous verrou, tracé `booking_completed` ; ni `BookingClosed`, ni notification.
- [x] Planifié chaque jour à 03:30, `withoutOverlapping()` (`routes/console.php`).
- [x] `BookingService::cancel()` : 422 `booking.cannot_cancel` pour une réservation `confirmed`
      dont `start_date` est aujourd'hui ou passée.
- [x] Front : « Annuler la réservation » caché dans ce cas (`BookingDetail`).
- [x] Tests : `CompleteEndedBookingsJobTest`, trois cas dans `BookingRefundTaskTest`,
      `BookingDetail.sejour-commence.tck-1301.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Une réservation `confirmed` finie la veille passe `completed` ; celle qui finit le jour
      même, une future, une `pending` passée et une sans dates ne bougent pas ; un second passage
      ne trouve rien.
- [x] AC2 — Annuler une réservation `confirmed` au séjour fini → 422 `booking.cannot_cancel`, statut
      inchangé, aucune tâche de remboursement ; même chose le premier jour du séjour, par l'agent.
- [x] AC3 — Une réservation `confirmed` qui commence demain s'annule toujours.
- [x] AC4 — Le bouton « Annuler » ne s'affiche plus pour un séjour confirmé commencé.

## Hors périmètre

- Le départ du client comme autre écrivain de `completed` (option non retenue par le porteur).
- Le refus ne vise que `confirmed` : une demande `pending` aux dates passées reste annulable (elle
  n'est pas un séjour ; les deux jobs d'expiration la ferment). Hypothèse notée, choix le plus
  étroit.

## Notes d'implémentation

- Les réservations passées déjà en base sont reprises par le premier passage du job (la sélection
  ne lit pas de borne basse).
- Ablation API : garde de `cancel()` neutralisée → 2 rouges dans `BookingRefundTaskTest` (200 au lieu
  de 422) ; entrée du planificateur retirée → 1 rouge dans `CompleteEndedBookingsJobTest`.
- Ablation front : avant correctif, 2 rouges sur 4 (bouton présent le jour du début et après la fin).
- Le code d'erreur se lit dans `code`, pas dans `message` (traduit par `abort_code`).
