---
id: TCK-022
title: Notifications
status: done
phase: P0
family: applicatif
estimate: M
wave: 4
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013]
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#12-appnotification-
tags: [back, front, notifications, email, push]
---

## Contexte

Le modèle `AppNotification` (renommé depuis `Notification`) existe dans `models-spec.md` avec la table `app_notifications`. Ce ticket met en place le centre de notifications in-app, les emails transactionnels et les préférences par canal.

## Objectif

Implémenter le système complet de notifications : centre in-app, emails transactionnels, préférences utilisateur et templates localisés.

## Delta à produire

### P0 — MVP bloquant

- [ ] Migration `app_notifications` : ajustement table (renommage colonnes `referenceable_id/type`, enum `NotificationType`, `NotificationChannel`)
- [ ] Endpoint `GET /api/notifications` — feed de notifications (paginé, filtrable)
- [ ] Endpoint `PUT /api/notifications/{id}/read` — marquer comme lu
- [ ] Endpoint `PUT /api/notifications/read-all` — marquer tout comme lu
- [ ] Composant React : cloche de notification + feed dropdown
- [ ] Mécanisme temps réel : Broadcasting Laravel (`BroadcastNotification` via Pusher/Reverb) — ou polling `GET /api/notifications?unread=1` toutes les 30s si Broadcasting non configuré
- [ ] Emails transactionnels Laravel (via `Illuminate\Notifications`) : confirmation inscription, réinitialisation mot de passe, nouvelle réservation
- [ ] Tests : `NotificationFeedTest`, `NotificationMarkReadTest`, `NotificationEmailTest`, `NotificationBroadcastTest`

### P1

- [ ] Notifications push web (via service worker + Web Push API)
- [ ] Endpoint `PUT /api/auth/notification-preferences` — préférences par canal (email, push, SMS) par utilisateur
- [ ] Templates localisés via `lang/` Laravel (FR, EN, WO)
- [ ] Page Next.js : page de préférences notifications
- [ ] Tests : `NotificationPreferencesTest`, `NotificationPushTest`

### P2

- [ ] Notifications SMS (événements critiques : impayé, expiration bail)
- [ ] Digest quotidien / hebdomadaire (job schedulé)

### P3

- [ ] Notifications WhatsApp

## Critères d'acceptation

- [ ] Le feed affiche les notifications triées par date, avec badge non-lu
- [ ] Marquer comme lu met à jour `is_read` et `read_at`
- [ ] Les emails transactionnels sont envoyés dans la langue de l'utilisateur
- [ ] Les préférences par canal sont respectées (pas d'email si désactivé)
- [ ] Le composant React met à jour le compteur en temps réel

## Hors périmètre

- Notifications de messagerie temps réel (→ TCK-029)
- Contenu des notifications métier spécifiques (chaque ticket métier définit ses propres notifications)

## Notes d'implémentation

### Résidu implémenté (wave1 back-user)

Delta restant sur le périmètre back couvert ici — le feed in-app, les endpoints `GET/PUT /api/notifications` et le marquage comme lu existent déjà (cf. `NotificationController`, `NotificationService`, `AppNotification`). Ce commit ajoute les classes `Notification` dédiées, les templates localisés, la config broadcasting et le digest quotidien.

### Fichiers créés

- `app/Notifications/RegistrationConfirmationNotification.php` — étend `Illuminate\Auth\Notifications\VerifyEmail`, wording localisé via `notifications.registration.*`.
- `app/Notifications/ResetPasswordNotification.php` — étend `Illuminate\Auth\Notifications\ResetPassword`, wording localisé via `notifications.password_reset.*`. URL reset pointant vers `config('app.frontend_url')` via `ResetPassword::createUrlUsing` (dans `AppServiceProvider::boot`).
- `app/Notifications/NewBookingNotification.php` — `ShouldQueue`, canaux dynamiques (`mail`, `database`, `broadcast`) selon `notifications_email_enabled` / `notifications_push_enabled` de l'utilisateur. `broadcastType() = 'booking.created'`.
- `app/Mail/DailyNotificationDigest.php` — `Mailable` (ShouldQueue) avec vue Markdown `emails.notifications.digest`, sujet et corps localisés via `$targetLocale`.
- `app/Jobs/SendDailyNotificationDigest.php` — chunk les utilisateurs avec email activé, agrège les `AppNotification` non lues des dernières 24 h, envoie un digest par destinataire (retourne `int $sent`).
- `config/broadcasting.php` — default `null` (env `BROADCAST_CONNECTION`), connections `reverb`, `pusher`, `ably`, `log`, `null`.
- `routes/channels.php` — canal privé `App.Models.User.{userId}` (auth : `$user->id === $userId`).
- `lang/{en,fr,wo}/notifications.php` — clés `salutation`, `registration.*`, `password_reset.*`, `new_booking.*`, `digest.*`.
- `resources/views/emails/notifications/digest.blade.php` — template Markdown (`@component('mail::message')`).

### Fichiers modifiés

- `app/Providers/AppServiceProvider.php` — listener `Registered → SendEmailVerificationNotification`, `ResetPassword::createUrlUsing` (URL frontend).
- `app/Models/User.php` — override `sendPasswordResetNotification()` et `sendEmailVerificationNotification()` pour utiliser nos classes localisées.
- `bootstrap/app.php` — enregistre `routes/channels.php`.
- `routes/console.php` — planifie `SendDailyNotificationDigest` quotidien à 18:00.

### Tests ajoutés (16 nouveaux tests)

- `tests/Feature/Notifications/NotificationEmailTest.php` (8 tests) — `Notification::fake()` + assertions locale FR/EN, canaux selon préférences utilisateur.
- `tests/Feature/Notifications/NotificationBroadcastTest.php` (4 tests) — config broadcasting safe en tests, event `NewNotification` cible le canal privé utilisateur, callback d'auth.
- `tests/Feature/Notifications/NotificationDigestTest.php` (4 tests) — `Mail::fake()` + `assertQueued`, digest envoyé uniquement aux utilisateurs éligibles, agrégation correcte.
- `tests/Feature/Auth/AuthPasswordResetTest.php` + `AuthEmailVerificationTest.php` — imports alias pour cibler les nouvelles classes (`NotificationFake` exige un match exact).

### AC vérifiés

- Emails transactionnels localisés (FR/EN/WO) via `__('notifications.*', [], $user->locale)`.
- Préférences par canal respectées (`NewBookingNotification::via()` inspecte `notifications_email_enabled`/`push_enabled`).
- Broadcasting privé par utilisateur, safe en tests (default driver `null`).
- Digest quotidien opérationnel (job schedulé, tests queue-based).

### Hors périmètre (reste à traiter dans tickets ultérieurs)

- Endpoint `PUT /api/auth/notification-preferences` (P1 — pas bloquant pour wave1).
- Service Worker Web Push, SMS, WhatsApp, page Next.js préférences (front + P2/P3).

### Résultats

- `./vendor/bin/pint` : pass (clean).
- `php artisan test` : 562 tests / 1611 assertions, tous verts.
