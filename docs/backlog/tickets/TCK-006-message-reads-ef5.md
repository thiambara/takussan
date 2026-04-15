---
id: TCK-006
title: Accusés de lecture individuels > 5 participants (EF5)
status: blocked
phase: EF
family: evolution
estimate: S
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-029]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#19-conversationparticipant-
tags: [back, messaging, evolution]
---

## Contexte

Issu du warning `features.md §1.7 P2` (ligne 196), justifié par l'évolution
future **EF5** (models-spec.md lignes 1677–1683). **Bloqué par déclencheur produit.**

Déclencheur formel: apparition de conversations à > 5 participants (canaux
support multi-agents, groupes d'équipe).
Tant qu'il n'est pas observé, le suivi actuel via
`conversation_participant.last_read_at` reste suffisant.

## Objectif

Passer d'un suivi `last_read_at` par participant à un suivi fin par
`(message, user)`, activé conditionnellement pour les grandes conversations.

## Delta à produire (post-déblocage)

- [ ] Table `message_reads(message_id, user_id, read_at, unique(message_id, user_id))`
- [ ] Job `MarkMessagesAsReadJob` (insertion batch à l'ouverture)
- [ ] Payload WebSocket enrichi avec la liste des lecteurs par message
- [ ] Migration rétroactive depuis `last_read_at` pour les conversations existantes
- [ ] Activation conditionnelle (`conversation.participants_count > 5`)

## Critères d'acceptation (à affiner au déblocage)

- [ ] Conversations ≤ 5 participants continuent d'utiliser `last_read_at` (pas d'impact perf)
- [ ] Le broadcast temps réel reflète les lectures en < 2 s
- [ ] La migration rétroactive ne crée pas de doublons
- [ ] Une passe `/sync-specs` est lancée après merge

## Hors périmètre

- Lecture fine sur conversations ≤ 5 participants

## Notes d'implémentation

_(gelé en attente du déclencheur produit)_
