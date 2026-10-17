---
id: TCK-805
title: "Messagerie : le premier message joint à la création d'une conversation est notifié"
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

Réf : **P38.03** du fichier de pistes, `retenu · autonome` (A1).

`ConversationController::store()` (directe) et `storeGroup()` créent le message
`initial_message` sans dispatcher `NotifyNewMessageJob`, que seul `sendMessage()` dispatche.
TCK-085 fait passer toute notification de nouveau message par ce job (sourdine et départs
compris). Le destinataire d'une directe ouverte avec un premier message n'en était pas prévenu.

Aucun écran du front n'envoie `initial_message` aujourd'hui : le défaut est dans le contrat de
l'API.

## Objectif utilisateur

Un message reçu est notifié, qu'il ouvre la conversation ou qu'il la poursuive.

## Contraintes strictes

- `NotifyNewMessageJob` dispatché **après** le commit, comme dans `sendMessage()` : le worker
  doit voir le message écrit.
- Aucun changement du contrat : `initial_message` reste accepté dans les deux branches.

## Delta à produire

- [x] `store()` (directe) : le message créé dans la transaction est dispatché après elle.
- [x] `storeGroup()` : le message créé après `GroupConversationService::create()` est dispatché.
- [x] Tests dans `ConversationTest`.

## Critères d'acceptation

- [x] AC1 — Une directe créée avec `initial_message` met en file un `NotifyNewMessageJob`, et un
      seul, sur ce message.
- [x] AC2 — Même chose pour un groupe créé avec `initial_message`.
- [x] AC3 — Une création sans `initial_message`, directe ou groupe, n'en met aucun en file.

## Hors périmètre

- Le cache `last_message_*` d'un groupe créé avec un premier message : `storeGroup()` ne le met
  pas à jour lui-même, et ce ticket n'y touche pas (relevé au passage, non mesuré).
- Le désarchivage que fait `sendMessage()` : une conversation neuve n'a aucun participant archivé.

## Notes d'implémentation

- **Ablation** : les deux `dispatch` retirés, AC1 et AC2 rougissent (« pushed 0 times instead
  of 1 time ») ; remis, les 13 tests de la classe sont verts.
- Dans un groupe créé avec un premier message, chaque membre reçoit l'invitation (TCK-804) et la
  notification du message : ce sont deux événements, comme pour un membre ajouté puis salué.
