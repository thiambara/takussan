---
id: TCK-2013
title: "Le fil de discussion rend l'auteur de chaque message (`sender: {id, full_name}`)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#20-message-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-175--relations-vers-un-compte-supprimé-en-douceur-par-la-suppression-de-compte"
tags: [api, web, messagerie, pistes]
---

## Objectif utilisateur

Dans un fil de groupe (intervention, bail, agence), chaque message reçu dit qui l'a écrit.

## Contexte

Réf : **P175.04** du fichier de pistes, `validé`.

Mesuré avant correctif sur `e261b5ef2` : `GET /api/conversations/{id}/messages`, avec ou sans
`after_id`, rend `sender_id` et jamais `sender` (`Undefined array key "sender"`). `ChatView`
n'écrit le nom de l'auteur que si `message.sender` est présent.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : `sender: {id, full_name}` dans `MessageResource`, nul pour un compte effacé

## Hypothèses (mode sans humain)

- `full_name` vaut `User::nameWithoutContact()` (prénom et nom, puis `username`, puis « — ») :
  c'est la règle déjà écrite pour le nom d'un compte montré à un autre compte, expéditeur d'un
  message compris (TCK-815). Un compte créé par téléphone, sans nom, ne rend donc pas une chaîne
  vide, et jamais une coordonnée.
- `sender` n'est rendu que là où il est chargé (`whenLoaded`) : les deux lectures du fil. La
  recherche de messages et la réponse à l'envoi restent sans `sender`.
- Le type du front `Message.sender` perd `avatar_url`, que l'API ne rend pas et que rien ne lit.

## Hors périmètre

- L'avatar de l'auteur.
- La recherche de messages (`SearchMessageController`) et la réponse de `sendMessage`.

## Delta à produire

- [x] `MessageResource` rend `sender: {id, full_name}`, nul pour un compte effacé.
- [x] `ConversationController::messages` charge `sender` dans ses deux lectures.
- [x] `takussan-web/src/types/message.ts` : `sender` sans `avatar_url`.
- [x] Garde : `tests/Feature/Api/ConversationMessageSenderTest.php`.

## Critères d'acceptation

- [x] AC1 — `GET /api/conversations/{id}/messages` rend `sender = {id, full_name}` pour l'auteur.
- [x] AC2 — De même avec `after_id` (relecture en direct).
- [x] AC3 — Auteur supprimé en douceur → `sender` présent et nul, `sender_id` inchangé.

## Notes d'implémentation

- Ablation : sans le chargement de `sender` dans le contrôleur, `whenLoaded` omet la clé →
  3 rouges sur 3 ; rétabli → 3 verts.
- Un `sender` chargé mais nul (compte effacé, portée `SoftDeletes`) : la fermeture rend `null`
  explicitement, la clé reste présente.
