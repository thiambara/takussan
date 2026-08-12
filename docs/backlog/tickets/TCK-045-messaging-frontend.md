---
id: TCK-045
title: "Messagerie — Frontend"
status: done
phase: P1
family: front
estimate: M
wave: 4
created: 2026-04-15
updated: 2026-04-23
depends_on: [TCK-054, TCK-056, TCK-057, TCK-059, TCK-029]
blocks: []
spec_refs:
  features: [docs/features.md#17-communication--messagerie]
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
    - docs/models-spec.md#20-message-
tags: [front, messaging, chat, real-time]
---

## Objectif utilisateur

Un utilisateur peut échanger des messages avec un agent ou bailleur à propos d'un bien.

## Contrat de données

- `GET /api/conversations` — liste des conversations de l'utilisateur
- `GET /api/conversations/{conversation}/messages` — messages d'une conversation
- `POST /api/conversations/{conversation}/messages` — envoyer un message
- `POST /api/conversations` — créer une conversation (depuis la fiche bien)
- `POST /api/conversations/{conversation}/messages/{message}/attachments` — pièce jointe

## Direction UX / Artistique

- **Liste conversations** : sidebar avec dernier message, statut non lu, photo interlocuteur.
- **Chat** : bulles style messagerie moderne. Pièces jointes cliquables (preview image, lien download).
- **Temps réel** : polling ou WebSocket au choix de l'IA. L'important est que l'expérience soit fluide.
- **Création conversation** : déclenchée depuis la fiche bien (bouton "Contacter l'agent") ou depuis le dashboard.
- **Notifications** : badge non lu dans la navigation, son/notification navigateur optionnel.

## Contraintes strictes (métier)

- Les messages sont liés à un bien (contexte affiché en en-tête du chat)
- Les pièces jointes sont limitées à 10MB, types autorisés : images, PDF, doc/docx
- Un utilisateur ne peut accéder qu'aux conversations dont il est participant
- Les messages ne sont pas modifiables/supprimables après envoi

## Delta à produire

- [ ] Section Messagerie dans le dashboard
- [ ] Liste des conversations avec statut non lu
- [ ] Interface de chat avec bulles et pièces jointes
- [ ] Création de conversation depuis la fiche bien
- [ ] Badge notifications non lues dans la navigation

## Critères d'acceptation

- [ ] Un utilisateur voit ses conversations et peut envoyer des messages
- [ ] Les pièces jointes sont uploadées et consultables
- [ ] Le contexte du bien est affiché dans le chat
- [ ] Les messages non lus sont signalés dans la navigation

## Hors périmètre

- Backend messagerie (→ TCK-029)
- Conversations de groupe (→ P2)
- Appels audio/vidéo (→ P3)

## Notes d'implémentation

### Temps réel — polling plutôt que WebSocket

Choix : **React Query `refetchInterval`** (pas de WebSocket pour le P1).

- Messages de la conversation ouverte : `3 s` quand l'onglet est visible, `false` (pause) quand caché (`document.visibilitychange`).
- Liste des conversations : `10 s` en permanence (badge non-lu).
- `staleTime: 0` sur ces deux hooks pour que tout focus retour déclenche un fetch.

Raisonnement : le backend actuel (Laravel Sanctum + nginx) ne dispose pas encore d'un canal Pusher / Soketi / Reverb. Le polling donne ~3 s de latence perçue, largement suffisant pour du chat conversationnel, sans complexifier l'infra. Migration WebSocket envisageable en P2 — l'API React Query se remplacera par `invalidateQueries()` côté listener sans toucher l'UI.

### Upload pièces jointes

Multipart après envoi : on envoie d'abord le message (`POST /messages`), on récupère son `id`, puis on pousse le fichier via `POST /messages/{id}/attachments`. Validation client : 10 Mo max, MIME images + PDF + doc/docx (cf. `schemas/message.ts`).

### Badge non-lus dans la nav

Non implémenté sur la sidebar dans ce ticket (évite de toucher la shared nav au-delà des markers Wave 3). Un ticket de suivi pourra câbler un compteur global — hook `useConversations()` expose déjà `unread_count` par conversation.
