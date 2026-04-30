---
id: POST-MVP-003
title: "Chat interne (si WhatsApp limitant)"
status: todo
slice: "Post-MVP Phase 2"
estimate: 3 weekends
created: 2026-04-16
depends_on: [POST-MVP-002]
blocks: [POST-MVP-004]
tags: [front, chat, post-mvp]
---

## Objectif utilisateur

Un seeker et un propriétaire peuvent communiquer directement sur la plateforme avec historique et notifications.

## Prérequis

**Déclencheur** : > 30% des propriétaires demandent une alternative à WhatsApp

## Contrat de données

- Messagerie temps réel (WebSocket)
- Conversations par annonce
- Notifications push/email
- Historique persistant

## Contraintes strictes

- **Optionnel** : WhatsApp reste par défaut
- **Temps réel** : messages instantanés
- **Mobile** : expérience WhatsApp-like
- **Backup** : export conversation possible

## Delta à produire

### Backend (Laravel)
- [ ] Models : Conversation, Message, Participant
- [ ] WebSocket broadcasting (Pusher/Socket.io)
- [ ] ChatController : send, read, typing
- [ ] Notification system
- [ ] File upload (photos dans chat)

### Frontend (Next.js)
- [ ] Chat interface (WhatsApp-like)
- [ ] Conversations list
- [ ] Real-time updates
- [ ] Push notifications
- [ ] Emoji support

### Features
- [ ] Messages texte + photos
- [ ] Indicateur "vu"/"en train d'écrire"
- [ ] Search dans conversations
- [ ] Mute/block conversations
- [ ] Quick replies (templates)

## Critères d'acceptation

- [ ] Messages livrés en < 1 seconde
- [ ] Interface intuitive (users WhatsApp)
- [ ] Notifications fiables
- [ ] Historique complet conservé

## KPI à tracker

- **Adoption chat interne** : > 40% des propriétaires
- **Response time** : < 2 heures
- **Message retention** : > 80% utilisent chat vs WhatsApp

## Hors périmètre

- Appels audio/vidéo
- Partage location
- Chatbots
- Traduction automatique
