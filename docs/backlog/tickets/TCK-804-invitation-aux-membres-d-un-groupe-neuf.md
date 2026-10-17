---
id: TCK-804
title: "Messagerie : les membres d'un groupe neuf reçoivent l'invitation, comme ceux qu'on ajoute après coup"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-38--messagerie--notifications-et-isolation-des-conversations"
tags: [back, messaging, notifications, pistes]
---

## Contexte

Réf : **P38.01** du fichier de pistes, `retenu · autonome` (A1).

L'en-tête de `GroupConversationService` et TCK-085 (« `ConversationInviteNotification` envoyée
aux nouveaux ajoutés ») promettent une invitation aux nouveaux participants d'un groupe. Seul
`addParticipants()` l'envoyait. `create()`, le chemin de `NewGroupDialog`
(`POST /api/conversations`, `type: group`), attachait les membres sans rien leur envoyer : un
membre n'apprenait l'existence d'un groupe neuf qu'au premier message.

## Objectif utilisateur

Une personne rangée dans un groupe à sa création en est prévenue, de la même façon qu'une
personne ajoutée ensuite.

## Contraintes strictes

- Même notification, mêmes canaux, même traitement d'échec qu'`addParticipants()` : une seule
  boucle d'envoi pour les deux chemins.
- Envoi **hors transaction**, après l'écriture des participants.
- Le créateur ne reçoit rien ; un identifiant répété ne reçoit qu'une invitation.

## Delta à produire

- [x] `GroupConversationService::sendInvites()`, extrait d'`addParticipants()`, appelé aussi par
      `create()` sur les membres attachés.
- [x] Tests dans `GroupConversationCreationTest`.

## Critères d'acceptation

- [x] AC1 — `POST /api/conversations` en groupe : chaque membre, sauf le créateur (même s'il se
      cite dans `participants`), reçoit une `ConversationInviteNotification` et une seule, qui
      désigne le groupe et son créateur.
- [x] AC2 — Une création refusée (un inconnu parmi les participants, 422) n'envoie rien.

## Hors périmètre

- Le message système d'ouverture d'un groupe : l'en-tête du service ne le demande que pour un
  changement du jeu de participants, et `create()` n'en émet pas aujourd'hui.
- Le premier message joint à la création : P38.03 (TCK-805).

## Hypothèses

- Un identifiant de membre qui ne correspond à aucun compte est déjà refusé en 422 par
  `CreateGroupConversationRequest` ; `sendInvites()` garde le `User::find()` d'avant par prudence.

## Notes d'implémentation

- **Ablation** : l'appel à `sendInvites()` retiré de `create()`, le test AC1 rougit
  (« The expected [ConversationInviteNotification] notification was not sent ») ; remis, les
  26 tests de la classe sont verts.
- Le test d'échec journalisé (`SwallowedNotificationFailuresAreLoggedTest`) passe toujours par
  `addParticipants()` : la boucle partagée garde sa journalisation.
