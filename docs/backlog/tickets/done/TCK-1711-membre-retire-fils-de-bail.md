---
id: TCK-1711
title: "Le retrait d'un membre lui fait quitter les fils de bail dont il ne lit plus le bail"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features: ["docs/features.md#112-agence--équipe"]
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-153--ce-que-le-retrait-en-leave_unassigned-laisse-au-nom-du-retiré-et-ce-qui-le-lit-encore"
tags: [back, agence, messagerie, autorisation, pistes]
---

## Objectif utilisateur

L'agent retiré de l'agence ne lit plus et n'écrit plus dans le fil d'un bail de l'agence que la
policy du bail lui refuse.

Réf : **P153.04**.

## Décision du porteur

- P153.04 : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Critère accordé : V2.

**Choix de l'implémenteur** (deux voies, aucune recommandation) : la première, « le retrait pose
`left_at` », bornée au plus étroit — les seuls fils portant un `lease_id` d'un bail **de
l'agence**, et parmi eux ceux dont le retiré ne lit plus le bail (`LeasePolicy::view`, jugée après
la suppression de ses profils). Elle ne change la règle d'accès de personne d'autre, quand une
branche « bail » dans `ConversationAccess` jugerait tous les participants de tous les fils de bail
(et demanderait la même règle en liste). Les fils d'intervention et de prospect ont déjà leur
branche.

## Delta à produire

- [x] `AgencyMemberRemovalService::leaveUnreadableLeaseThreads`, appelée dans la transaction du
  retrait.
- [x] Test : `MembreRetireFilsDeBailTest`.

## Critères d'acceptation

- [x] AC1 — fil de groupe portant le `lease_id` d'un bail de l'agence, agent et locataire participants ; après le retrait en `leave_unassigned` : `ConversationAccess::allows` faux pour le retiré, `GET` et `POST …/messages` → 403.
- [x] AC2 — le locataire garde le fil.

## Hors périmètre

- Les autres cas du même trou (participant d'un fil de bail qui perd la lecture du bail sans
  retrait : angle 191 proposé).
- La restauration d'un membre (`MemberProfileRestoreTest`) ne le fait pas rentrer dans ces fils.

## Notes d'implémentation

- Ablation : l'appel retiré du retrait → AC1 rouge ; remis → vert.
