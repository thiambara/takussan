---
id: TCK-671
title: "Avis système des groupes : le rôle se lit et se traduit, l'aperçu de la liste se dérive de l'événement"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo
tags: [front, api, i18n, messaging, pistes]
---

## Contexte

Réf : **P06.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

Deux défauts des avis système d'une conversation de groupe (TCK-085) :

- `SystemMessageFactory::roleChanged()` émet `metadata.role` ; `SystemMessageBubble` lisait
  `meta.new_role ?? 'member'`. Tout changement de rôle s'affichait « X a changé le rôle de Y en
  member », jeton anglais brut, dans les trois langues, y compris une promotion admin.
- `MessageObserver::created()` tire `last_message_preview` du `content`, que `humanise()` écrit en
  `sprintf` français. La liste des conversations l'affichait tel quel : l'aperçu d'un avis système
  restait en français pour un lecteur `en` ou `wo`. La liste ne rendait pas le dernier message
  (le front l'incluait par `include=last_message`, que `ConversationController::index` ignore).

## Décision du porteur

clé alignée, rôle traduit, aperçu dérivé de metadata.event côté front

## Objectif

Un avis système se lit dans la langue du lecteur, dans le fil comme dans l'aperçu de la liste.

## Delta à produire

- [x] API : `ConversationController::index` charge `lastMessage` ; `ConversationResource` rend
      `last_message` = `{id, type, metadata}`, la `metadata` seulement pour un avis système
      (`null` sinon).
- [x] Front : `useTexteMessageSysteme` rend le texte d'un avis depuis ses codes (`event`, `role`,
      `cause`, `status`) ; `SystemMessageBubble` et `ConversationList` l'emploient tous deux, le
      texte du serveur restant le repli d'un code inconnu.
- [x] Clé alignée sur l'API : `metadata.role`, et `old_role`/`new_role` (jamais émis) retirés du
      type `MessageMetadata`.
- [x] Rôle traduit par les clés existantes `messaging.group.info.roleAdmin` / `roleMember` :
      aucun texte neuf.

## Critères d'acceptation

- [x] AC1 — Un avis `role_changed` avec `role: admin` s'affiche « Alice a changé le rôle de Bob en
      Admin. » ; avec `role: member`, « … en Membre. ».
- [x] AC2 — `GET /api/conversations` rend `last_message.type` et, pour un avis système,
      `last_message.metadata` (`event`, `role`, noms) ; pour un message ordinaire, `metadata: null`.
- [x] AC3 — Sous la locale `en`, l'aperçu d'une conversation dont le dernier message est un
      changement de rôle s'affiche « Alice changed Bob's role to Admin. », et non le texte français
      du serveur.
- [x] AC4 — Un message ordinaire garde l'aperçu du serveur.

## Hypothèses (mode sans humain)

- La clé s'aligne **côté front** (`role`) : l'API l'écrit déjà dans les messages stockés, que
  l'observer interdit de modifier (TCK-085, immuabilité).
- `last_message` ne porte que `id`, `type` et la `metadata` d'un avis système : la metadata d'un
  message de membre (durée d'une note vocale…) n'est pas l'objet de l'aperçu et ne sort pas.
- Un rôle inconnu du front retombe sur le texte du serveur, comme une cause de maintenance inconnue.

## Hors périmètre

- `participant_removed` avec `self_leave` : la bulle (et donc l'aperçu dérivé) rend « X a retiré X
  du groupe » au lieu de « X a quitté le groupe » ; le défaut préexiste dans la bulle, il n'est pas
  cité par P06.02.
- `last_message_preview` reste écrit en français par l'API : il n'est plus que le repli.

## Notes d'implémentation

- Rouge avant correctif : 2 tests API (`last_message` absent de la liste), 2 tests de la bulle
  (« en member »), 1 test de la liste (aperçu français sous `en`).
- Ablation API : `lastMessage` retiré du chargement → 2 rouges ; filtre « système seulement » retiré
  → le test du message ordinaire rougit. Ablation front : aperçu remis sur `last_message_preview`
  → 1 rouge ; hook relisant `new_role` → 2 rouges ; rôle non traduit → 2 rouges. Correctif remis →
  tout vert.
