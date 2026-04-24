---
id: TCK-103
title: "Digest quotidien / hebdomadaire"
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-022, TCK-070]
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#12-appnotification-
tags: [back, notifications, scheduled]
---

## Objectif utilisateur

Permettre à un utilisateur ayant choisi `frequency=daily` ou `weekly`
dans ses préférences de notification (TCK-070) de recevoir **un seul
email digest** regroupant toutes les notifications non-critiques de la
période, plutôt qu'un email par notification — pour réduire le bruit et
améliorer l'engagement.

## Contrat de données

**Backend uniquement.**

`NotificationPreference` (TCK-070) expose déjà :
- `email_frequency` : `instant | daily | weekly | off`.
- `digest_send_at` : heure locale d'envoi (défaut `08:00`).
- `digest_day_of_week` : jour pour weekly (défaut `monday`).

Comportement actuel (instant) inchangé. Ce ticket ajoute le mode
**daily** et **weekly** :

- Job scheduled : `App\Jobs\Notifications\SendNotificationDigestJob`.
- Cadence : exécution toutes les heures (`hourly()`), traite les users
  dont l'heure locale courante = `digest_send_at` ET (mode = daily, OU
  mode = weekly + jour courant = `digest_day_of_week`).
- Pour chaque user éligible : agréger toutes les `AppNotification`
  non-lues, non-critiques, non encore digérées, créées depuis le
  dernier digest envoyé (ou les 24h / 7j précédentes au premier run).
- Si **0 notification** sur la fenêtre → ne **pas** envoyer d'email.
- Construire un email Markdown via Mailable
  `NotificationDigestMail` groupé par catégorie (bookings, messages,
  payments, system…).
- Marquer chaque notification incluse avec `digested_at = now()` pour
  ne pas la renvoyer la prochaine fois.

**Notifications critiques** : continuent à être envoyées **instantanément**
quel que soit le mode (jamais digérées).

**Tracking** : champ `digested_at` sur `AppNotification` (nullable).

## Contraintes strictes (métier)

- **Critical bypass** : `notification->isCritical() === true` → toujours
  envoyée immédiatement, jamais incluse dans un digest.
- **Idempotence** : `digested_at` empêche le double-envoi en cas de retry
  du job.
- **Timezones** : utiliser `User.timezone` pour calculer l'heure locale.
  Si non défini, `Africa/Dakar` par défaut (cf. agence).
- **Empty digest** : on n'envoie jamais d'email "vous n'avez aucune
  notification" — silent no-op.
- **Volume** : agrégation par lot de 200 users / run pour éviter pics
  SMTP. Le job dispatch des sub-jobs queueables.
- **Bounce / unsubscribe** : respecter le `email_frequency=off` →
  jamais d'envoi. Lien unsubscribe one-click dans l'email digest qui
  set `email_frequency=off` côté préférences.
- **Limite de taille** : un digest contenant > 50 notifications est
  tronqué (top 50, lien vers in-app pour voir le reste).
- **Test mode** : flag dev pour envoyer immédiatement un digest preview
  à un user (commande artisan `notifications:digest-preview {user_id}`).

## Delta à produire

- [ ] Migration : `add_digested_at_to_app_notifications`.
- [ ] Job : `App\Jobs\Notifications\SendNotificationDigestJob` (hourly).
- [ ] Job sub : `App\Jobs\Notifications\BuildUserDigestJob` (par user,
      queueable).
- [ ] Service : `App\Services\Notifications\DigestBuilderService`
      (collecte + groupement par catégorie).
- [ ] Mailable : `App\Mail\NotificationDigestMail` (template Markdown
      multi-langue).
- [ ] Template Markdown : `resources/views/emails/notifications/digest.md`.
- [ ] Schedule dans `app/Console/Kernel.php` (`hourly()`,
      `withoutOverlapping`).
- [ ] Commande artisan : `notifications:digest-preview {user_id}`.
- [ ] Route GET signed : `notifications/unsubscribe/{user}` →
      `email_frequency=off`.
- [ ] Tests : `DigestBuilderServiceTest` (groupement, exclusion
      critiques, fenêtre temporelle), `SendNotificationDigestJobTest`
      (timezone, daily vs weekly, empty no-op, idempotence),
      `NotificationDigestMailTest` (rendu, lien unsubscribe).

## Critères d'acceptation

- [ ] AC1 — user `email_frequency=daily`, `digest_send_at=08:00`, fuseau
      Dakar : reçoit **un** email à 08:00 contenant ses notifs des
      24 dernières heures.
- [ ] AC2 — user `weekly`, `day=monday`, `08:00` : reçoit l'email
      uniquement le lundi matin couvrant les 7 derniers jours.
- [ ] AC3 — user `instant` : aucun digest, comportement actuel inchangé.
- [ ] AC4 — user `off` : aucun email envoyé.
- [ ] AC5 — notification `critical=true` reste envoyée immédiatement et
      n'apparaît **pas** dans le digest.
- [ ] AC6 — fenêtre vide → aucun email envoyé (silent no-op).
- [ ] AC7 — chaque notification incluse a `digested_at` renseigné après
      envoi ; un retry du job ne la réinclut pas.
- [ ] AC8 — lien unsubscribe one-click dans l'email passe
      `email_frequency=off` (test feature signed route).

## Hors périmètre

- Digest SMS / push (P3 — par nature, le digest est email-only).
- Personnalisation de la mise en forme du digest par l'utilisateur (P3).
- Stats d'engagement digest (open rate, click rate) — couvert par un
  futur ticket analytics.
- Multi-tenant : chaque user reçoit son propre digest indépendant des
  agences (rien à faire de spécial).

## Notes d'implémentation

_(à remplir par implementing-specs)_
