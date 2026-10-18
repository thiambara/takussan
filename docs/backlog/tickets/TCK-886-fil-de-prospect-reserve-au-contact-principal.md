---
id: TCK-886
title: "Fil de prospect : seul le contact principal actuel du bien y a accès (ADR-0068, 1/3)"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: [TCK-887]
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
    - "docs/models-spec.md#19-conversationparticipant-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-38--messagerie--notifications-et-isolation-des-conversations"
tags: [back, messaging, authorization, pistes]
---

## Contexte

Réf : **P38.05** du fichier de pistes, `validé` par le porteur (critère accordé : V8, plus d'un
ticket ; la règle d'accès est tranchée par
[ADR-0068](../../adr/0068-le-fil-d-un-prospect-suit-le-contact-principal-du-bien.md)). Premier des
trois tickets demandés : la branche d'accès. TCK-887 transmet le fil par le résolveur, TCK-888 par
les chemins qui changent le contact principal.

Un agent dont la collaboration au bien est retirée garde la lecture et l'écriture du fil d'un
prospect, numéro compris : `ConversationAccess::allows()` ne juge que la participation active et
la branche intervention (TCK-592).

## Décision du porteur

ADR-0068, découpé en trois tickets, dans cet ordre : (1) la branche d'accès (`ConversationAccess`, `constrainListing()`, `participatingQuery()`, filtre de `NotifyNewMessageJob`) ; (2) la transmission du fil sous verrou par le résolveur ; (3) la transmission par `PrimaryAgentDesignator`, `PropertyCollaboratorController` et `AgentHandoverService`, et le 422 de `POST /api/conversations`

## Objectif

Sur un fil de prospect (directe portant un `property_id`), un participant autre que le prospect
n'a accès que s'il est `PrimaryPropertyContact::for($property)`, sur tous les chemins.

## Delta à produire

- [x] `ConversationAccess::prospectAllows()`, branchée dans `allows()` à côté de la branche
  intervention (`branchesAllow()`).
- [x] `constrainListing()` (donc `participatingQuery()`, la liste, la recherche de messages,
  l'export et les correspondants) : un fil de prospect ne reste que pour son prospect, ou pour le
  contact principal du bien.
- [x] `NotifyNewMessageJob` filtre par `branchesAllow()` : l'ancien répondant ne reçoit plus
  l'aperçu.
- [x] Test : `tests/Feature/Messaging/ProspectConversationAccessTest.php`.

## Critères d'acceptation

- [x] AC1 — Collaboration retirée → `GET /api/conversations/{id}`, `GET …/messages` et
  `POST …/messages` rendent 403 pour l'ancien répondant.
- [x] AC2 — Le fil n'apparaît plus dans sa liste ni dans `participatingQuery()`.
- [x] AC3 — Le prospect garde l'accès et voit le fil dans sa liste.
- [x] AC4 — Le message suivant du prospect ne notifie pas l'ancien répondant.
- [x] AC5 — Un agent devenu inéligible sans écriture sur le bien (bloqué) perd l'accès.
- [x] AC6 — Un fil sans `property_id`, ou d'un autre type, n'est pas touché.

## Hypothèses

- Le bien est lu `withTrashed()` : un bien supprimé en douceur garde son contact principal pour
  la règle, plutôt que de couper le fil à tous les répondants.
- La règle du contact principal se juge en PHP (`PrimaryPropertyContact`, une requête par agent
  examiné) : la liste la juge sur les seuls biens des fils de prospect où l'appelant répond, puis
  remet la liste des biens retenus dans la requête SQL.

## Hors périmètre

- La transmission du fil au nouveau contact principal : TCK-887 et TCK-888. Entre-temps, le
  nouveau contact principal n'est pas participant et ne voit pas le fil.

## Notes d'implémentation

- Reproduit avant correctif : 4 rouges sur 7 (`GET …` → 200 au lieu de 403 ; fil encore listé ;
  2 notifications au lieu de 1 ; `allows()` vrai pour l'agent bloqué).
- Ablation : `ConversationAccess` et le job remis à l'état de `pre-dev` → les 4 mêmes rouges ;
  le seul filtre du job retiré → 1 rouge, la notification. Remis → 7 verts.
