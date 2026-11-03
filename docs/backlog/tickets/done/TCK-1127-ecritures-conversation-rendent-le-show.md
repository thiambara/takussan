---
id: TCK-1127
title: "Le renommage d'un groupe et le changement de rôle rendent la conversation que rend `show`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-95--réponse-dune-écriture-face-au-show-du-même-modèle"
tags: [back, messagerie, conversations, pistes]
---

## Contexte

Réf : **P95.02** du fichier de pistes, `validé (délégué)` (V7 accordé : forme d'une réponse que le
front n'écrit pas encore dans son cache).

`ConversationController::update` (renommage) ne charge que `property`, et
`ConversationParticipantController::update` (changement de rôle) rend `fresh()` sans aucune
relation : ni `participants`, ni `property`. `show` charge les deux depuis TCK-576.

## Décision du porteur (déléguée)

`ConversationController::update` et `ConversationParticipantController::update` chargent ce que charge `show` (`property` et les `participants` actifs avec `media`), par une méthode partagée appelée aussi par `show` ; test : renommage d'un groupe et changement de rôle → `data.participants` et `data.property` égaux à ceux de `GET /api/conversations/{id}` ; ablation : retirer le chargement

## Objectif utilisateur

Une écriture sur une conversation rend la même conversation que sa lecture : le jour où le front
écrit la réponse dans son cache, le fil garde ses participants et les gestes d'administration.

## Delta à produire

- [x] `Conversation::loadForDetail()` : le chargement de `show` (`property`, participants actifs
      avec `media`), appelé par `show` et par les deux écritures.
- [x] `ParticipantRoleResponseShapeTest` (TCK-952) : `property` et `participants` sont désormais
      présents ; `unread_count` et `last_message` restent absents.
- [x] Test `tests/Feature/Api/ConversationWriteMatchesShowTest.php`.

## Critères d'acceptation

- [x] AC1 — `PATCH /api/conversations/{id}` (renommage) → `data.participants` et `data.property`
      égaux à ceux de `GET /api/conversations/{id}`.
- [x] AC2 — `PATCH /api/conversations/{id}/participants/{user}` → idem.
- [x] AC3 — un participant parti (`left_at`) n'apparaît dans aucune des deux réponses.

## Hors périmètre

- Les écritures des autres modèles (P95.03, à valider : règle transversale).
- Le front : il invalide aujourd'hui et ne lit pas la réponse.

## Notes d'implémentation

- Ablation : les deux contrôleurs rendus à `0d52a71ee` → 3 rouges sur 3 (les deux cas neufs, et
  `ParticipantRoleResponseShapeTest`, qui attend désormais les participants) ; correctif remis → 3/3.
- `ParticipantRoleResponseShapeTest` (TCK-952) assertait l'ABSENCE de `property` et de
  `participants` sur le changement de rôle : il épinglait le défaut. Il garde la règle « jamais
  d'objet vide » et l'absence de ce que `show` ne charge pas (`unread_count`, `last_message`).
