---
id: TCK-1450
title: "Repasser un membre à un rôle déjà tenu, ou réajouter un membre retiré, restaure son profil au lieu de rendre 500 (P92.02)"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92"
  models:
    - "docs/models-spec.md"
tags: [api, agency, membership, pistes]
---

## Objectif

Qu'un admin d'agence puisse faire passer un membre d'agent à admin puis de nouveau à agent, ou
réajouter un membre retiré, sans 500.

## Contexte

Réf : **P92.02** du fichier de pistes (angle 92), `validé` le 2026-10-21 (validation en bloc ;
critère V2 accordé : le profil restauré reprend son `agency_role_id` d'avant, donc ses capacités).

`AgentProfile`, `AgencyAdminProfile` et `OwnerProfile` se suppriment en douceur, et l'unicité
`(user_id, agency_id)` de leurs tables est pleine. `AgencyMemberRoleController` (`setAgencyAdmin`,
`setAgent`, `setOwner`) et `AgencyController::addAgent` matérialisaient par `firstOrCreate`, qui ne
voit pas la ligne supprimée : l'INSERT lève `UniqueConstraintViolationException`, 500.
`UserRoleController::materializeOrRestore` (TCK-278) résolvait déjà ce cas, pour sa seule route.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

### Choix de l'implémenteur

La `Piste` demande « un seul chemin de matérialisation des profils qui restaure le profil supprimé
(celui de `UserRoleController`), employé par les trois écrivains ». Retenu :
`App\Services\Membership\ProfileMaterializer::materializeOrRestore()`, le code de TCK-278 déplacé
tel quel (restaure la ligne supprimée, réécrit le statut, laisse une ligne active intacte), employé
par `UserRoleController`, `AgencyMemberRoleController` et `AgencyController::addAgent`.

Hypothèse : « les trois écrivains » sont ces trois contrôleurs. L'acceptation d'une invitation,
citée par le constat comme « à vérifier », ne matérialise pas de profil par `(user_id, agency_id)` :
elle rattache un profil `invitable` créé à l'émission (`InvitationService::INVITABLE_TYPE_BY_ROLE`),
et n'est pas touchée.

## Reste à faire

- Le chemin de l'invitation (une personne déjà profilée ou retirée de l'agence qu'on réinvite) n'est
  ni rejoué ni changé.

## Delta produit

- [x] `ProfileMaterializer` (neuf), ex-`UserRoleController::materializeOrRestore`.
- [x] `AgencyMemberRoleController` et `AgencyController::addAgent` passent par lui.
- [x] `tests/Feature/Agency/MemberProfileRestoreTest.php` (3 cas).

## Critères d'acceptation

- [x] AC1 — `PUT …/members/{u}/role` agent → `agency_admin` → `agent` → `agency_admin` : 200 à
      chaque pas, une seule ligne par table, la ligne agent restaurée puis de nouveau supprimée.
- [x] AC2 — agent → `owner` → `agent` → `owner` : 200 à chaque pas.
- [x] AC3 — retrait (`DELETE …/agents/{u}`) puis réajout (`POST …/members`) : 200, une seule ligne
      `agent_profiles`, statut `active`.

## Notes d'implémentation

- **Ablation** : `AgencyMemberRoleController` et `AgencyController` remis à `pre-dev` → 3 rouges
  (`UniqueConstraintViolationException`) ; correctif remis → 3 verts.
