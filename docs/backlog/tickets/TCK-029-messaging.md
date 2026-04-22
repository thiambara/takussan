---
id: TCK-029
title: Communication & messagerie
status: review
phase: P1
family: back
estimate: M
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013, TCK-034]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
    - docs/models-spec.md#20-message-
tags: [back, messaging, conversations, realtime]
---

## Contexte

Les modèles `Conversation`, `ConversationParticipant` et `Message` sont tous nouveaux dans `models-spec.md`. La messagerie est un canal essentiel entre clients et agents autour d'un bien ou d'une réservation.

## Objectif

Implémenter la messagerie privée : conversations 1↔1, envoi de messages avec pièces jointes, liste avec statut non lu et notifications temps réel.

## Delta à produire

### P1

- [ ] Migration `conversations` : `property_id`, `booking_id`, `lease_id`, `subject`, `type`, `status`, `last_message_at`
- [ ] Migration `conversation_participants` : `conversation_id`, `user_id`, `role`, `joined_at`, `last_read_at`, `is_muted`
- [ ] Migration `messages` : `conversation_id`, `sender_id`, `content`, `type` (text, system), `read_at`, medialibrary collection `attachments`
- [ ] Endpoint `POST /api/conversations` — créer une conversation (1↔1, liée à un bien/réservation)
- [ ] Endpoint `GET /api/conversations` — liste des conversations avec dernier message et compteur non lu
- [ ] Endpoint `POST /api/conversations/{conversation}/messages` — envoyer un message texte avec pièces jointes
- [ ] Endpoint `PUT /api/conversations/{conversation}/read` — marquer comme lu
- [ ] Notification in-app + email sur nouveau message (via TCK-022)
- [ ] Tests : `ConversationCreationTest`, `MessageSendTest`, `ConversationListTest`, `MessageReadStatusTest`

### P2

- [ ] Conversations de groupe (multi-participants) : `POST /api/conversations/{conversation}/participants`
- [ ] Accusés de lecture individuels (→ P2 futur si >5 participants)
- [ ] Recherche dans l'historique des messages : `GET /api/conversations/{conversation}/messages?search=`
- [ ] Archivage de conversation : `PUT /api/conversations/{conversation}/archive` — seul un participant peut archiver sa propre vue (soft-hide, pas de suppression des messages)

### P3

- [ ] Appels audio / vidéo intégrés
- [ ] Traduction automatique FR ↔ EN ↔ WO (→ P3 futur)

## Critères d'acceptation

- [ ] Un client peut démarrer une conversation avec un agent depuis une fiche bien
- [ ] Les messages sont envoyés et reçus avec pièces jointes
- [ ] La liste affiche le dernier message et le compteur de messages non lus
- [ ] Marquer comme lu met à jour `last_read_at` du participant
- [ ] Une notification est envoyée au destinataire sur nouveau message
- [ ] Un participant peut archiver une conversation (elle disparaît de sa liste) sans affecter les autres participants

## Hors périmètre

- Frontend messagerie (→ TCK-045)
- Accusés de lecture >5 participants (→ P2 futur)
- Traduction automatique (→ P3 futur)
- Appels audio/vidéo (→ P3 futur)

## Notes d'implémentation

### Réalisé (2026-04-22)

- Migration `add_archived_at_to_conversation_participants` — colonne `archived_at` (nullable) par participant + index `(user_id, archived_at)`.
- `Conversation::participants()` expose désormais `archived_at` dans le pivot.
- `ConversationController` :
  - `index` filtre les conversations archivées (`?archived=1` pour les surfacer).
  - `markAsRead` (`PUT /conversations/{conversation}/read`) met à jour `last_read_at` du participant.
  - `archive` / `unarchive` (`PUT /conversations/{conversation}/archive|unarchive`) — scope par participant (soft-hide).
  - `sendMessage` dispatch maintenant `NotifyNewMessageJob` (fire-and-forget), marque la vue de l'expéditeur comme lue, et réinitialise `archived_at` pour les autres participants (réapparition dans leur liste).
- `App\Jobs\NotifyNewMessageJob` — job queueable utilisant `NotificationService` pour expédier la notification `message` hors du cycle HTTP.
- Tests : `ConversationArchiveReadTest` (7 — archive scope, unarchive, auto-unarchive sur nouveau message, markAsRead, guard non-participant, dispatch job). `ConversationTest` conservé.

### Hors périmètre / reporté

- Compteur de messages non-lus dans le resource (peut être ajouté sans migration — déjà supporté par `last_read_at`), reporté au ticket front TCK-045.
- Pièces jointes media-library sur messages — champs `attachments` non activés ici (migration `create_messages_table` prépare déjà la structure, à câbler si TCK-015 merged).
- Conversations de groupe multi-participants + recherche historique — P2, hors scope.
