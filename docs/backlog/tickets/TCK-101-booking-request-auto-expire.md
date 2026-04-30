---
id: TCK-101
title: "Expiration automatique demandes de réservation"
status: done
phase: P2
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-026]
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#5-booking
tags: [back, bookings, scheduled]
---

## Objectif utilisateur

Garantir qu'une demande de réservation laissée **sans réponse de l'agent**
au-delà d'un délai configurable est automatiquement expirée, libérant le
créneau et notifiant les deux parties — pour éviter les Booking en
`pending` infini qui bloquent le calendrier.

## Contrat de données

**Backend uniquement.**

- Job scheduled : `App\Jobs\Booking\ExpirePendingBookingsJob`.
- Fréquence : exécution toutes les 15 min via `app/Console/Kernel.php`
  (`schedule->job(...)->everyFifteenMinutes()`).
- Critère : tout `Booking` avec `status=pending` dont
  `created_at < now() - threshold_hours`.
- Threshold configurable : `AgencySetting.booking_pending_expiry_hours`
  (int, défaut 48 heures, range 1–168). Lecture par booking via la
  relation `booking->property->agency->settings`.
- Action : transition `pending → expired` (status existant ou nouveau —
  cf. spec_refs.models). Renseigne `expired_at`, `expiry_reason="auto"`.

**Notifications** (via TCK-022) :

- `BookingExpiredNotification` au locataire (canaux : in-app + email).
- `BookingExpiredNotification` à l'agent référent (in-app uniquement).

**Endpoint admin / debug** (optionnel pour ce ticket, mais utile) :
`POST /api/admin/bookings/{booking}/expire-now` pour forcer l'expiration
manuelle (rôle `agency_admin` minimum).

## Contraintes strictes (métier)

- **Idempotent** : un Booking déjà `confirmed`, `cancelled`, ou `expired`
  est ignoré par le job.
- **Lock** : utiliser un cache lock (`Cache::lock('expire-bookings', 600)`)
  pour empêcher exécutions concurrentes en cas de chevauchement.
- **Batching** : traiter par lots de 100 max par exécution pour éviter
  les pics de charge en cas de backlog (queue/dispatch des
  notifications).
- **Audit** : chaque expiration logue dans ActivityLog (TCK-018) avec
  causer = `system`.
- **Pas de transition silencieuse** : la notification est obligatoire
  côté locataire (sinon il ne sait pas pourquoi sa demande a disparu).
- **Threshold = 0 désactivé** : si `booking_pending_expiry_hours <= 0`,
  l'agence opte out (pas d'expiration automatique).

## Delta à produire

- [ ] Migration : `add_booking_pending_expiry_hours_to_agency_settings`
      (default 48).
- [ ] Migration : `add_expired_at_and_expiry_reason_to_bookings` (si
      colonnes absentes — cf. spec_refs.models).
- [ ] Job : `App\Jobs\Booking\ExpirePendingBookingsJob` (queueable,
      retryable 3x).
- [ ] Service : `App\Services\Booking\BookingExpirationService` (logique
      pure, testable hors job).
- [ ] Notification : `BookingExpiredNotification` (multi-channel).
- [ ] Schedule dans `app/Console/Kernel.php` (everyFifteenMinutes,
      withoutOverlapping).
- [ ] Controller `Admin\BookingController@expireNow` + route +
      Policy.
- [ ] Tests : `ExpirePendingBookingsJobTest` (5 scénarios — happy path,
      idempotence, opt-out via setting=0, batching, lock).

## Critères d'acceptation

- [ ] AC1 — un Booking `pending` créé il y a > threshold h passe à
      `expired` au prochain run du job.
- [ ] AC2 — un Booking `pending` créé il y a < threshold h reste
      `pending`.
- [ ] AC3 — un Booking `confirmed` ou `cancelled` n'est jamais touché.
- [ ] AC4 — locataire reçoit `BookingExpiredNotification` (in-app + email).
- [ ] AC5 — agent référent reçoit la notification in-app.
- [ ] AC6 — `AgencySetting.booking_pending_expiry_hours = 0` désactive
      l'expiration automatique pour les biens de cette agence.
- [ ] AC7 — exécutions concurrentes du job ne double-expirent jamais
      (lock).
- [ ] AC8 — chaque expiration crée une entrée ActivityLog avec
      causer=system.

## Hors périmètre

- Relances avant expiration (P3 — "votre demande expire dans 6h").
- Auto-expiration des Lease ou autres entités — booking court-durée
  uniquement.
- Reprogrammation automatique après expiration (P3).
- UI agent dédiée à voir l'historique des expirations (couverte par les
  filtres du dashboard TCK-043 + ActivityLog TCK-018).

## Notes d'implémentation

### Implémenté (2026-04-26)

- Migration `add_expired_at_and_expiry_reason_to_bookings_table` — ajoute les colonnes `expired_at` et `expiry_reason` avec vérification d'existence.
- `BookingExpirationService` — logique pure configurable via `agency.settings['booking_pending_expiry_hours']` (défaut 48h, range 1-168, 0 = opt-out). Lock via `Cache::lock`, batch 100 max.
- `ExpirePendingBookingsJob` — queueable, retryable 3x, planifié `everyFifteenMinutes()` via `routes/console.php`.
- `BookingExpiredNotification` — multi-canaux (tenant: in-app + email, agent: in-app uniquement). Traductions EN/FR/WO.
- `Admin\BookingController@expireNow` — endpoint `POST /api/admin/bookings/{booking}/expire-now`, rôle `agency_admin` minimum.
- Tests `ExpirePendingBookingsJobTest` — 6 scénarios (happy path, idempotence, opt-out, batching, lock, récent non expiré).
- Pint clean — 0 violations.
