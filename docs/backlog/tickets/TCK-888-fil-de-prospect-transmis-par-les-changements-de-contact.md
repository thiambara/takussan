---
id: TCK-888
title: "Fil de prospect transmis par la désignation, les collaborations et la passation ; directe sur un bien refusée (ADR-0068, 3/3)"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-887]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
    - "docs/models-spec.md#19-conversationparticipant-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-38--messagerie--notifications-et-isolation-des-conversations"
tags: [back, messaging, pistes]
---

## Contexte

Réf : **P38.05** du fichier de pistes, `validé` par le porteur (critère accordé : V8 ; règle :
[ADR-0068](../../adr/0068-le-fil-d-un-prospect-suit-le-contact-principal-du-bien.md) § 1 et § 3).
Troisième des trois tickets. TCK-886 a posé la branche d'accès, TCK-887 la transmission par le
résolveur, qui n'a lieu qu'à la relance du prospect.

## Décision du porteur

ADR-0068, découpé en trois tickets, dans cet ordre : (1) la branche d'accès (`ConversationAccess`, `constrainListing()`, `participatingQuery()`, filtre de `NotifyNewMessageJob`) ; (2) la transmission du fil sous verrou par le résolveur ; (3) la transmission par `PrimaryAgentDesignator`, `PropertyCollaboratorController` et `AgentHandoverService`, et le 422 de `POST /api/conversations`

## Objectif

Les chemins qui déplacent le contact principal par une écriture transmettent les fils de prospect
du bien sans attendre le prospect ; `POST /api/conversations` ne crée plus de directe rattachée à
un bien.

## Delta à produire

- [x] `PropertyConversationResolver::transmitForProperty()` : transmet chaque fil de prospect du
  bien au contact principal actuel, par `transmit()` (verrou du fil, idempotent).
- [x] `PrimaryAgentDesignator::designate()` : après la transaction (`DB::afterCommit`), quand la
  marque a changé.
- [x] `PropertyCollaboratorController` : après `store`, `update` et `destroy`.
- [x] `AgentHandoverService::transfer()` : pour les biens verrouillés, après la transaction.
- [x] `StoreConversationRequest` : une directe avec `property_id` → 422 sur `property_id`
  (`messaging.errors.conversation_context_forbidden`, texte existant).
- [x] Test : `tests/Feature/Messaging/ProspectConversationHandoffTest.php` ; deux tests existants
  ramenés au contrat (voir Notes).

## Critères d'acceptation

- [x] AC1 — Désignation d'un autre agent principal → le fil est transmis sans attendre le prospect.
- [x] AC2 — Collaboration du répondant retirée → transmis au suivant.
- [x] AC3 — Rôle du répondant changé (`viewer`) → transmis au suivant.
- [x] AC4 — Passation des collaborations → transmis au repreneur.
- [x] AC5 — `POST /api/conversations` sans `type`, avec `property_id` → 422 sur `property_id`.

## Hypothèses

- Re-mesuré avant le 422 : au front, `POST /api/conversations` n'est appelé que par
  `useCreateGroupConversation` (`type: 'group'`, `takussan-web/src/lib/queries/conversations.ts`) ;
  `useCreateConversation` est retiré depuis TCK-576. Le groupe garde son `property_id`.
- `store` transmet aussi : un premier agent invité remplace le titulaire comme contact principal.
- La passation transmet pour les biens qu'elle verrouille ; un retrait de l'agence sans repreneur
  (agent devenu inéligible sans écriture sur le bien) transmet au passage suivant du prospect,
  comme le prévoit ADR-0068 § 3.

## Hors périmètre

- Une notification au nouveau répondant (ADR-0068, Conséquences : code neuf, hors décision).

## Notes d'implémentation

- Reproduit avant correctif : 5 rouges sur 5 (le premier agent reste répondant actif ; 201 au lieu
  de 422).
- Ablation : désignateur, contrôleur, passation et requête remis à l'état de `pre-dev` (résolveur
  gardé) → 5 rouges, un par chemin. Remis → 5 verts.
- `ConversationTest::test_conversation_list_includes_attached_property_for_subject_fallback` et
  deux cas « directe » de `GroupConversationCreationTest` postaient une directe avec
  `property_id` : ils posent désormais le fil comme le résolveur l'écrit, ou envoient la directe
  sans bien, et vérifient le 422.
