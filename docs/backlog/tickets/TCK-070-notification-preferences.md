---
id: TCK-070
title: "Préférences notifications (canaux + fréquence)"
status: todo
phase: P1
family: applicatif
estimate: M
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-022, TCK-057, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#24-appnotification
    - docs/models-spec.md#2-user
tags: [notifications, preferences, front, back]
---

## Contexte

TCK-022 (notifications) est `review` : backend expose le centre in-app (feed, marqué lu/non lu, emails transactionnels). Aucune UI permettant à un utilisateur de régler ses préférences par canal (email, push, in-app, SMS) ni par type d'événement (message, paiement, réservation, etc.). La spec §2.3 P1 demande cette feature.

Ticket full-stack : nécessite un modèle `NotificationPreference` (par user × event_type × channel) côté backend.

## Objectif utilisateur

Un utilisateur doit pouvoir choisir quels types d'événements il reçoit sur quel canal (email / in-app / push / SMS), pour réduire le bruit sans rater l'essentiel.

## Contrat de données

### Backend (à créer)

- Migration `create_notification_preferences_table` : `user_id`, `event_type` (enum ou string), `channel` (email|inapp|push|sms), `enabled` (bool), unique composite.
- Seeder : pour chaque user existant, créer des préférences par défaut (tout activé pour in-app + email, sms off).
- Modèle `NotificationPreference` + relation `User::notificationPreferences()`.
- Controller `NotificationPreferenceController` :
  - `GET /api/me/notification-preferences` — retourne la matrice complète du user courant
  - `PATCH /api/me/notification-preferences` — body `{ event_type, channel, enabled }[]` — update bulk
- Adaptation des notifications existantes : chaque envoi doit consulter les préférences avant de pousser sur un canal.
- Définir la liste canonique des `event_type` supportés : `message_received`, `booking_request`, `booking_status_changed`, `lease_payment_due`, `lease_payment_overdue`, `maintenance_status_changed`, `review_received`, `saved_search_match`, etc.

### Frontend

- Section `/app/profile/notifications` (ou onglet dans profile) avec matrice event × channel.

## Direction UX / Artistique

Matrice simple et dense, à la Slack notification preferences / GitHub notification settings. Lignes = types d'événements (regroupés par domaine : Messages · Réservations · Baux · Maintenance · Avis · Alertes). Colonnes = canaux (checkbox par case). Sauvegarde automatique au toggle ou bouton "Enregistrer" global.

## Contraintes strictes (métier)

- Le canal `inapp` est toujours actif (on ne peut pas le désactiver) — c'est la source de vérité du feed.
- Les notifications critiques (ex: `password_reset`, `security_alert`) ignorent les préférences et passent toujours sur email + in-app.
- Le canal `sms` est masqué/grisé si `phone_verified_at` est null.
- Le canal `push` est masqué/grisé si le user n'a pas de subscription web push enregistrée (P2 — pour ce ticket, afficher mais noter "pas encore supporté").

## Delta à produire

### Backend

- [ ] Migration `create_notification_preferences_table`
- [ ] Modèle `NotificationPreference` + relation `User`
- [ ] `NotificationPreferenceController` avec GET + PATCH bulk
- [ ] Service `App\Services\Notifications\PreferenceResolver::shouldSend(user, event_type, channel): bool`
- [ ] Modification des classes `Notifications\*` pour consulter le resolver avant `via()`
- [ ] Seeder + backfill pour users existants
- [ ] Tests : matrice retournée, update bulk, critical notif bypass preferences

### Frontend

- [ ] Page `/app/profile/notifications` (nav secondaire dans profile)
- [ ] Matrice checkbox event × channel, regroupée par domaine
- [ ] Sauvegarde automatique ou bouton "Enregistrer"
- [ ] État désactivé pour sms si téléphone non vérifié (avec lien vers TCK-069)
- [ ] Tests Vitest : rendu matrice, flow toggle

## Critères d'acceptation

- [ ] AC1 — Un user voit la matrice complète avec ses préférences actuelles au chargement
- [ ] AC2 — Toggler une case persiste le changement et confirme visuellement
- [ ] AC3 — Un event critique (ex: password_reset) envoyé après que le user a tout désactivé arrive quand même sur email + in-app
- [ ] AC4 — Un user sans `phone_verified_at` voit les cases SMS grisées avec message explicatif
- [ ] AC5 — Les préférences par défaut sont créées automatiquement pour un nouveau user
- [ ] AC6 — `php artisan test` + `npm run test` verts, Pint clean

## Hors périmètre

- Digest quotidien/hebdomadaire (P2, ticket séparé)
- Push web/mobile réel (infrastructure, P2)
- Notifications SMS (infrastructure provider, P2 — ici on prépare juste les préférences)
- WhatsApp (P3)

## Notes d'implémentation

_(Rempli à l'implémentation)_
