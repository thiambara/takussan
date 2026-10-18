---
id: TCK-887
title: "Fil de prospect : la relance retrouve le même fil, transmis au contact principal (ADR-0068, 2/3)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-886]
blocks: [TCK-888]
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
[ADR-0068](../../adr/0068-le-fil-d-un-prospect-suit-le-contact-principal-du-bien.md) § 3). Deuxième
des trois tickets : la transmission du fil par le résolveur. TCK-886 a posé la branche d'accès.

`PropertyConversationResolver` cherchait un fil où le visiteur **et le destinataire du moment**
sont participants actifs : quand le contact principal change, la relance du prospect ouvrait un
second fil, et l'historique restait chez l'ancien agent.

## Décision du porteur

ADR-0068, découpé en trois tickets, dans cet ordre : (1) la branche d'accès (`ConversationAccess`, `constrainListing()`, `participatingQuery()`, filtre de `NotifyNewMessageJob`) ; (2) la transmission du fil sous verrou par le résolveur ; (3) la transmission par `PrimaryAgentDesignator`, `PropertyCollaboratorController` et `AgentHandoverService`, et le 422 de `POST /api/conversations`

## Objectif

Le prospect garde un seul fil par bien : sa relance le retrouve, quel que soit le répondant, et le
transmet au contact principal actuel avant d'y écrire.

## Delta à produire

- [x] `PropertyConversationResolver::query()` : le fil du prospect (`created_by`, participant
  actif) sur ce bien, sans critère de répondant ; `findExisting()` perd son paramètre
  `$recipient`.
- [x] `PropertyConversationResolver::transmit()` : une opération, sous le verrou du fil,
  idempotente ; `firstOrCreate()` l'applique au fil trouvé, sous le verrou qu'il tient déjà.
- [x] Test : `tests/Feature/Messaging/ProspectConversationTransferTest.php`.

## Critères d'acceptation

- [x] AC1 — Collaboration retirée, puis relance du prospect → même identifiant de fil, un seul fil
  sur le bien ; le nouveau contact principal est participant actif et lit les deux messages ;
  l'ancien répondant a `left_at`.
- [x] AC2 — `GET /api/public/properties/{slug}/conversation` rend le fil du prospect et le nouveau
  destinataire, sans rien écrire.
- [x] AC3 — Deux transmissions de suite : 3 participations, `left_at` de l'ancien inchangé.
- [x] AC4 — Un répondant qui revient a une participation neuve : ni sourdine, ni archivage.

## Hypothèses

- **L'ouverture du chat ne transmet pas** : elle reste en lecture pure (contrat de TCK-500,
  `test_resolve_writes_nothing`). Elle rend déjà le fil du prospect et le nouveau destinataire ;
  la transmission a lieu à la relance, et plus tôt par les chemins de TCK-888. La branche de
  TCK-886 ferme l'accès de l'ancien répondant entre-temps.
- Le prospect est `created_by` (ADR-0068 § 1). Une directe rattachée à un bien et ouverte par un
  autre que le visiteur (`POST /api/conversations`, sans appelant au front, fermé par TCK-888) ne
  capte plus son contact.
- Un répondant qui revient retrouve sa ligne (la paire est unique) remise à neuf :
  `joined_at` = maintenant, `left_at`, `is_muted`, `archived_at` et `last_read_at` remis à zéro,
  comme une participation neuve.

## Hors périmètre

- Les appelants hors résolveur (désignation, retrait de collaboration, passation) : TCK-888.

## Notes d'implémentation

- Reproduit avant correctif : 4 rouges sur 4 (deux fils au lieu d'un ; `transmit()` absent ;
  `conversation_id` nul à l'ouverture).
- Ablation : résolveur et contrôleur remis à l'état de `pre-dev` → 4 rouges ; le seul appel à la
  transmission retiré de `firstOrCreate()` → 2 rouges (AC1, AC4). Remis → 4 verts.
