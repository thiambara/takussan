---
id: TCK-2023
title: "Ajouter un participant à un groupe exige d'abord l'accès au fil"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2019]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-191--fils-rattachés-à-un-bail-ou-à-un-bien-face-à-la-policy-de-leur-contexte"
tags: [api, messagerie, suspension, autorisation, pistes]
---

## Objectif utilisateur

Un agent suspendu, resté administrateur d'un groupe de bail, ne peut plus y ajouter un tiers qui
lirait alors tout l'historique du fil.

## Contexte

Réf : **P191.03** du fichier de pistes.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : `addParticipant` exige d'abord `ConversationAccess::allows` pour l'acteur, et hérite de P191.01

## Hypothèses (mode sans humain)

- Les autres gestes d'administrateur (`promote`, `rename`, retrait d'un tiers) ne sont pas dans la
  décision : ils restent tels quels.

## Delta à produire

- [x] `ConversationPolicy::addParticipant()` exige `ConversationAccess::allows()` puis
  l'administration active du groupe.
- [x] Garde dans `tests/Feature/Messaging/MembreSuspenduFilsDeContexteTest.php`.

## Critères d'acceptation

- [x] AC1 — Agent suspendu, administrateur du groupe de bail, avec un correspondant → `can` faux,
  `POST /api/conversations/{id}/participants` en 403, le tiers n'est pas ajouté.

## Hors périmètre

- P191.04 (participants qui ne lisent pas le bail).

## Notes d'implémentation

- Reproduit sur `c7f6c4101` : `can('addParticipant')` restait vrai après la suspension.
- Ablation : `allows` retiré de la policy → rouge ; rétabli → vert.
