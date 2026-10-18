---
id: TCK-861
title: "Invitation à un groupe par code et cible, directe qu'on ne quitte pas, liste sans anciens membres, ré-invitation lue"
status: doing
phase: P2
family: back
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
    - "docs/models-spec.md#19-conversationparticipant-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-38--messagerie--notifications-et-isolation-des-conversations"
tags: [back, front, messaging, notifications, pistes]
---

## Contexte

Réf : **P38.07** du fichier de pistes (« Petites améliorations » de l'angle 38), `validé` par le
porteur (critères accordés : V8, plus d'un correctif ; V7, le `last_read_at` d'une ré-invitation).

Quatre écarts mesurés sur la messagerie :

1. `ConversationInviteNotification` écrit une ligne `app_notifications` sans `code` ni `target`
   (ADR-0032) : la ligne de la cloche n'est pas un lien vers le groupe, et son titre est figé dans
   la langue de l'envoi.
2. `ConversationPolicy::removeParticipant()` laisse tout participant actif se retirer lui-même,
   sans regarder le type du fil : une directe peut être « quittée ».
3. `ConversationController::index()` charge `participants.media` partis compris : nom et avatar
   des anciens membres partent dans la liste.
4. Une ré-invitation remet `left_at` et `archived_at` à nul mais garde l'ancien `last_read_at` :
   tout ce qui a été écrit pendant l'absence compte comme non lu.

## Décision du porteur

quatre correctifs : invitation par `NotificationCode` avec la cible `conversation` (en `wo`, le texte français tel quel) ; `removeParticipant` refusé sur une directe ; `index()` ne charge que les participants actifs ; une ré-invitation pose `last_read_at` à l'heure de la ré-invitation

## Objectif utilisateur

L'invité ouvre le groupe depuis la cloche, dans sa langue ; une directe ne se quitte pas ; la liste
ne montre plus d'anciens membres ; un membre ré-invité ne trouve pas son absence en non-lus.

## Contrat de données

- Nouveau code `message.group_invite` : type `message`, interrupteur `message_received` (celui de
  l'ancienne classe), paramètres `inviter` et `subject` (texte), cible
  `NotificationTarget::of('conversation', <id>)`. Textes `title`, `body`, `sms` côté API, `title`
  et `body` côté front, dans les trois langues ; en `wo`, le texte français tel quel.
- `ConversationInviteNotification` disparaît : `GroupConversationService::sendInvites()` passe par
  `NotificationService::send()`.
- `DELETE /api/conversations/{directe}/participants/{soi}` → 403 (`messaging.admin_only`, le code
  existant de la route).
- `GET /api/conversations` : `participants` ne contient que les participations sans `left_at`.
- Ré-invitation (`addParticipants` sur une ligne quittée) : `last_read_at` = l'heure de la
  ré-invitation.

## Delta à produire

- [x] `NotificationCode::MessageGroupInvite` et ses textes (API, front).
- [x] `GroupConversationService::sendInvites()` par `NotificationService::send()` ; retrait de
  `ConversationInviteNotification` et de ses clés `notifications.conversation_invite`.
- [x] `ConversationPolicy::removeParticipant()` : groupe seulement.
- [x] `ConversationController::index()` : participants actifs.
- [x] `GroupConversationService::addParticipants()` : `last_read_at` à la ré-invitation.
- [x] Test : `ConversationParticipantsHygieneTest` (4 cas) ; tests existants de l'invitation
  ramenés sur le code.

## Critères d'acceptation

- [x] AC1 — Un admin ajoute un membre → sa ligne `app_notifications` porte `code =
  message.group_invite`, les paramètres `inviter` et `subject`, et la cible `conversation`.
- [x] AC2 — Un participant d'une directe se retire lui-même → 403, sa participation reste active.
- [x] AC3 — Un membre parti d'un groupe n'apparaît pas dans `participants` de `GET
  /api/conversations` pour les membres restants.
- [x] AC4 — Un message écrit pendant l'absence d'un membre, puis sa ré-invitation → `unread_count`
  = 0 pour lui dans la liste.

## Hypothèses

- Le paramètre `subject` garde le repli de l'ancienne classe (`#<id>` pour un groupe sans sujet).
- Le titre stocké (repli de la cloche) et l'e-mail sont rendus par `NotificationRenderer` depuis
  `codes.message.group_invite` ; l'e-mail perd sa formule « Bonjour, » propre, comme les autres codes.

## Hors périmètre

- Rien côté écran de conversation : aucun écran n'offre de quitter une directe (lu,
  `ChatView.tsx`, `isGroup && !isWidget`).

## Notes d'implémentation

(à compléter)
