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
- Le fil qu'ouvre la plateforme à la première assignation d'une intervention
  (`SyncMaintenanceConversation`, TCK-592) reste sans invitation : ses membres sont déjà prévenus
  par `maintenance.assigned` et `maintenance.step_*`, et `MaintenanceNotificationsTest` épingle
  exactement ces notifications.

## Delta à produire

- [x] `GroupConversationService::sendInvites()`, extrait d'`addParticipants()`, appelé aussi par
      `create()` sur les membres attachés.
- [x] `create(…, sendInvites: false)` pour `SyncMaintenanceConversation::open()`.
- [x] Tests dans `GroupConversationCreationTest`.

## Critères d'acceptation

- [x] AC1 — `POST /api/conversations` en groupe : chaque membre, sauf le créateur (même s'il se
      cite dans `participants`), reçoit une `ConversationInviteNotification` et une seule, qui
      désigne le groupe et son créateur.
- [x] AC2 — Une création refusée (un inconnu parmi les participants, 422) n'envoie rien.
- [x] AC3 — La première assignation d'une intervention ne notifie que ce qu'elle notifiait :
      `maintenance.assigned` au prestataire, `maintenance.step_*` au demandeur.

## Hors périmètre

- Le message système d'ouverture d'un groupe : l'en-tête du service ne le demande que pour un
  changement du jeu de participants, et `create()` n'en émet pas aujourd'hui.
- Le premier message joint à la création : P38.03 (TCK-805).

## Hypothèses

- Le fil d'intervention garde son comportement d'avant (aucune invitation à l'ouverture) : c'est
  la plateforme qui l'ouvre, pas une personne qui invite. Un prestataire **réassigné** y entre par
  `addParticipants()` et reçoit l'invitation, comme avant ce ticket ; l'écart entre les deux cas
  préexiste et n'est pas tranché ici.
- Un identifiant de membre qui ne correspond à aucun compte est déjà refusé en 422 par
  `CreateGroupConversationRequest` ; `sendInvites()` garde le `User::find()` d'avant par prudence.

## Notes d'implémentation

- **Ablation** : l'appel à `sendInvites()` retiré de `create()`, le test AC1 rougit
  (« The expected [ConversationInviteNotification] notification was not sent ») ; remis, les
  26 tests de la classe sont verts.
- **Piège** : `impacted-tests` sur le lot a rougi deux tests de `MaintenanceNotificationsTest`
  (une ligne `app_notifications` de plus, au code nul, pour le prestataire et le demandeur) :
  `SyncMaintenanceConversation` ouvre le fil d'intervention par `create()`. D'où le paramètre
  `sendInvites`. Retiré du listener, ces deux tests rougissent : ils gardent l'exclusion.
- Le test d'échec journalisé (`SwallowedNotificationFailuresAreLoggedTest`) passe toujours par
  `addParticipants()` : la boucle partagée garde sa journalisation.
