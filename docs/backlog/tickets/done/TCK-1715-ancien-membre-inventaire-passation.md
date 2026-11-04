---
id: TCK-1715
title: "L'ancien membre retiré en leave_unassigned s'inventorie et se passe encore"
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
tags: [back, agence, passation, pistes]
---

## Objectif utilisateur

Après avoir retiré un agent en `leave_unassigned`, l'admin de l'agence voit encore ce qui reste à
son nom et peut le passer plus tard à un membre.

Réf : **P153.07**.

## Décision du porteur

- P153.07 : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué, appliquée : « la première voie, accepter inventaire et passation pour qui
a un profil agent ou admin supprimé en douceur dans l'agence (`withTrashed()` dans
`refuseNonStaff`), le bailleur restant refusé comme l'exige AC33 ».

## Delta à produire

- [x] `AgentHandoverController::refuseNonStaff` lit les profils agent et admin `withTrashed()`.
- [x] Tests : deux cas dans `AgentHandoverTest`.

## Critères d'acceptation

- [x] AC1 — agent retiré en `leave_unassigned` : `GET …/members/{id}/portfolio` → 200 avec ses comptes ; `POST …/handover` vers un membre → 200, tâches passées.
- [x] AC2 — un compte sans aucun profil d'équipe dans l'agence, jamais membre → 422 `agent_handover.member_not_staff` ; le bailleur reste refusé (test existant de verif-591 M2).

## Hors périmètre

- `remove_after` sur un ancien membre : le retrait répond `agency_member.not_in_agency` (422), comme
  aujourd'hui pour un non-membre ; l'écran ne l'envoie que dans le parcours de retrait.

## Notes d'implémentation

- Ablation : `withTrashed()` retirés → AC1 rouge (422) ; remis → 13/13.
