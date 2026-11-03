---
id: TCK-1748
title: "Les invitations de l'agence se jugent par `team.invite`, admin compris : liste, lecture, création, révocation, relance"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-116"
tags: [api, invitations, autorisation, capacites, pistes]
---

## Contexte

Réf : **P116.03** du fichier de pistes, `validé`.

`InvitationPolicy::viewAny`, `view`, `create` et la portée de `GET /api/invitations`
(`InvitationController::visibleScope`) jugeaient `isAgencyAdminAt` ; `revoke` et `resend`
jugeaient `isAgencyAdminAt || canActAt(TeamInvite)`. Un admin dont le rôle retire `team.invite`
listait, créait et révoquait ; un agent qui la tient révoquait une invitation qu'il ne pouvait pas
lister.

## Décision du porteur

« validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket »

Critère accordé : V2 (le retrait de la branche `isAgencyAdminAt` retire un geste à l'admin sans
la capacité). L'entrée ne porte pas de recommandation du délégué ; la Piste n'a qu'une voie.

**Choix** : « comme `AgencyPolicy::updateKyc` », donc l'admin principal de l'agence garde le geste
sans la capacité (il ne peut pas s'en priver), et tout autre membre le tient par `team.invite`
dans l'agence. Une seule méthode, `InvitationPolicy::invitesAt()`, porte la règle des cinq
abilities ; la portée de la liste lit `viewAny`.

## Objectif

Retirer `team.invite` à un rôle retire les invitations de l'agence ; la tenir les ouvre.

## Delta à produire

- [x] `InvitationPolicy::invitesAt()` : admin principal, ou `canActAt(TeamInvite, $agency)`.
- [x] `viewAny`, `view`, `create` la lisent pour l'agence active (`staffAgencyId()`), `revoke` et
  `resend` pour l'agence de l'invitation.
- [x] `visibleScope` ouvre l'agence à qui passe `viewAny`.
- [x] Test : `InvitationJugeeParTeamInviteTest`.

## Critères d'acceptation

- [x] AC1 — Un agent qui tient `team.invite` liste, lit et relance les invitations de l'agence, et
  peut en créer.
- [x] AC2 — Un admin dont le rôle retire `team.invite` ne les liste plus (il ne voit que celles
  qu'il a émises), ne les lit pas, n'en crée pas, ne les révoque ni ne les relance.
- [x] AC3 — L'admin du rôle système et l'admin principal gardent le geste.

## Hors périmètre / Reste à faire

- Les trois assistants d'invitation (`AgentProfilePolicy::canManageTeamIn`,
  `OwnerProfilePolicy::invite`, `ServiceProviderProfilePolicy::canInviteIn`) gardent
  `isAgencyAdminAt || team.invite` : un admin sans la capacité invite encore par eux. La Piste
  ne vise que les cinq abilities de `InvitationPolicy` et la liste.

## Notes d'implémentation

- Avant correctif : 2 rouges sur 5 (l'agent qui tient la capacité liste `[]`, l'admin sans elle
  liste l'invitation).
- Ablation : policy et contrôleur remis à `HEAD` → les 2 mêmes rouges ; remis → 5/5.
