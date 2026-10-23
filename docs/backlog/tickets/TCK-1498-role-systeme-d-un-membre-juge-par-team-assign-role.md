---
id: TCK-1498
title: "Changer le rôle système d'un membre se juge par `team.assign_role`, dans une policy (P116.01)"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-116"
  features:
    - "docs/features.md"
tags: [api, membership, authorization, pistes]
---

## Objectif

Que `PUT /api/users/{user}/role` et `PUT /api/agencies/{agency}/members/{user}/role` se jugent par
`team.assign_role`, comme l'affectation d'un rôle personnalisé, et que les deux reprises en
FormRequest disparaissent.

## Contexte

Réf : **P116.01** du fichier de pistes (angle 116), `validé` le 2026-10-22 (critère V2 accordé).

`UpdateUserRoleRequest::authorize` et `UpdateAgencyMemberRoleRequest::authorize` reprenaient
« super-admin, admin principal (seconde route), ou `isAgencyAdminAt` sous le profil actif », sans
capacité. Le front garde déjà le sélecteur par `useCan('team.assign_role')`.

## Décision du porteur

> porteur (2026-10-22) : juger par `team.assign_role` par une policy (comme `AgencyRolePolicy::assign`) et retirer les deux reprises

Choix : `AgencyPolicy::changeMemberRole(User, Agency)`, de la forme de `removeMember` et
`updateKyc` (super-admin, administrateur principal, puis `team.assign_role` à l'agence sous un
profil actif de cette agence) — `AgencyRolePolicy::assign` seul n'exige pas le profil actif sur
l'agence visée (contrat TCK-146, docblock d'`AgencyPolicy`). Les deux FormRequest délèguent ; pour
`PUT /api/users/{u}/role`, l'agence est celle du profil actif, et le super-admin passe sans agence,
comme avant.

Hypothèse : l'administrateur principal passe désormais aussi sur `PUT /api/users/{u}/role` (il
n'y était pas court-circuité) ; il y passait déjà en pratique par son profil admin, et c'est la
forme des voies sœurs.

## Delta produit

- [x] `AgencyPolicy::changeMemberRole` (neuve).
- [x] `UpdateUserRoleRequest::authorize`, `UpdateAgencyMemberRoleRequest::authorize` : délégation.
- [x] `tests/Feature/Agency/MemberRoleChangeCapabilityTest.php` (6 cas).

## Critères d'acceptation

- [x] AC1 — admin dont le rôle retire `team.assign_role` : 403 sur les deux routes, rien ne change.
- [x] AC2 — agent qui porte `team.assign_role` : 200 sur les deux routes.
- [x] AC3 — agent du rôle système : 403 ; admin du rôle système : 200 ; administrateur principal
      sans la capacité : 200 ; admin d'une autre agence : 403.

## Notes d'implémentation

- **Ablation** : les deux FormRequest remises à `pre-dev` (policy laissée) → 2 rouges (AC1, AC2) ;
  remises → 6/6.
