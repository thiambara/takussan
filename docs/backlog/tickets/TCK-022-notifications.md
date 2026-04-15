---
id: TCK-022
title: Notifications
status: todo
phase: P0
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-16
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

_(à remplir par implementing-specs)_
