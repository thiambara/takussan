---
id: TCK-1244
title: "Liste des membres et équipe de la console : l'administrateur d'agence seul y figure, et les candidats à une délégation gardent la condition du service"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-120--listes-de-personnes-des-sélecteurs-face-au-prédicat-décriture"
tags: [api, web, agence, equipe, delegations, pistes]
---

## Contexte

Réf : **P120.02** du fichier de pistes, `validé (délégué)`.

Le passage d'un membre à `agency_admin` (`PUT /api/agencies/{a}/members/{u}/role`,
`PUT /api/users/{u}/role`) supprime ses profils d'agent et de bailleur. Or la base de
`GET /api/agencies/{id}/members` et de `GET /api/admin/agencies/{id}/team` ne cherche que
`agentProfiles` OU `ownerProfiles` : le promu disparaît de la liste des membres, donc de tous les
sélecteurs qui la lisent, et de l'équipe de la console, alors que l'API l'accepte comme cible
(`filter[assignable]` l'attend, `POST /api/contact-leads/{lead}/assign` rend 200).
`UserAdminController` porte déjà la troisième branche depuis TCK-277.

## Décision du porteur (déléguée)

« validé (délégué) — élargir la base de `listMembers` et d'`AgencyDetailController::team` par `orWhereHas('agencyAdminProfiles', …)`, comme `UserAdminController` (TCK-277), par la portée commune de P119.01 ; ne pas garder les profils d'agent ou de bailleur au changement de rôle ; les candidats à une délégation n'offrent pas l'admin seul, que `RoleDelegationService::create` refuse »

Critère accordé : V7.

## Objectif

Un membre de l'agence qui n'y tient qu'un profil d'administrateur figure dans la liste des membres
et dans l'équipe de la console, sans devenir candidat à une délégation.

## Delta à produire

- [x] `User::scopeMembreDe(int $agencyId)` : agent, bailleur ou administrateur dans l'agence, sans
      statut — la portée commune que P119.01 posera aussi sous `filter[agency_id]` de
      `GET /api/admin/users`.
- [x] La portée sous `AgencyController::listMembers` et `Admin\AgencyDetailController::team`.
- [x] `filter[role]` de `User::buildAgencyMembersQuery` accepte plusieurs rôles séparés par une
      virgule, lus en OU (avant : `TypeError`, 500).
- [x] `useDelegationCandidates` envoie `filter[role]=agent,owner` (la condition
      `isAgentAt || isOwnerAt` du service, sans statut) ; les docblocks du hook et de
      `CreateDelegationDialog` le disent.

## Critères d'acceptation

- [x] AC1 — Un agent promu `agency_admin` (profil d'agent supprimé) figure dans `/members` sans
      filtre, avec `filter[assignable]=1`, avec `filter[role]=agency_admin`, et dans
      `/api/admin/agencies/{id}/team`.
- [x] AC2 — Il est absent de `filter[role]=agent` et de `filter[role]=agent,owner` ; un bailleur
      de l'agence est présent dans ce dernier.
- [x] AC3 — `useDelegationCandidates` demande `filter[role]=agent,owner`.

## Hors périmètre

- Le `filter[agency_id]` de `GET /api/admin/users` et la mise en commun avec
  `UserAdminController` : P119.01, d'un angle que traite l'autre instance.
- Garder les profils d'agent ou de bailleur au changement de rôle : écarté par la décision.

## Notes d'implémentation

- Ablations, chacune sur `AgencyMembersListTest::test_un_agent_promu_…` : base de `listMembers`
  et de `team` remise à deux branches → rouge (« L'admin promu reste dans la liste des membres ») ;
  `filter[role]` remis à une valeur unique → 500, `TypeError … must be of type string, array
  given` (spatie découpe la valeur sur la virgule) ; `team` seul remis → rouge sur l'équipe de la
  console. Front : le test du hook rouge sans le filtre.
- Hypothèse : `filter[role]=agent,owner` juge le profil sans statut, comme `hasProfileAt()` du
  service (TCK-587) ; un agent suspendu reste donc candidat, comme avant.
