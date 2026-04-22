---
id: TCK-029
title: Communication & messagerie
status: todo
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

_(à remplir par implementing-specs)_
