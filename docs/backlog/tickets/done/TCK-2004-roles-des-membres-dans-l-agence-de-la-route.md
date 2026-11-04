---
id: TCK-2004
title: "Listes de membres : `roles` rapporté à l'agence de la route, statut du profil à côté"
status: done
phase: P2
family: bug
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-176--rôles-lus-toutes-agences-confondues-par-profiletypes"
  adr:
    - "docs/adr/0005-contrat-http-conserve-roles.md"
tags: [api, profils, equipe, pistes]
---

## Objectif utilisateur

L'admin de l'agence A qui lit la liste de ses membres, rattache un membre ou change son rôle n'y
apprend plus ce que ce membre tient dans une autre agence ; un membre suspendu y reste visible, avec
son statut, pour être réactivé.

## Contexte

Réf : **P176.04** du fichier de pistes.

Décision du porteur : validé — validation du porteur (2026-10-23) : ADR-0005, amendement du 2026-10-23 : `roles` rapporté à l'agence de la route dans les listes de membres (un membre suspendu y garde son type, avec son statut), dans la réponse de `POST members`, et à l'agence où le rôle est posé pour `PUT /users/{user}/role`

Mesuré avant correctif sur `5fcadf598` (`AgencyMembersRolesDansLAgenceTest`, 4 rouges sur 4) :
`GET /api/agencies/{A}/members` et `POST …/members` rendaient des `roles` qui ne se rapportaient pas
à A ; `PUT /api/users/{user}/role` dans A rendait le rôle `agency_admin` que la cible tient dans B.

## Hypothèses (mode sans humain)

- La clé du statut (« le nom de la clé se fixe au ticket », ADR-0005, point 4) est `role_statuses` :
  un objet `{type: statut}` pour les seuls types d'agence tenus dans l'agence de la route.
- Les types globaux (`super_admin`, `service_provider` actif, `customer`, `tenant`) suivent la
  règle de `/api/auth/me` (TCK-2002), comme avant ils suivaient `profileTypes()`.
- `PUT /users/{user}/role` rend aussi `role_statuses`, sur l'agence où le rôle est posé : l'ADR lui
  applique « la même règle » que les listes.

## Delta à produire

- [x] `HasProfiles::memberProfileTypesAt()` et `profileStatusesAt()`.
- [x] `UserResource::dansLAgence($user, $agencyId)` : `roles` de l'agence, tous statuts, et
  `role_statuses`.
- [x] `AgencyController::listMembers` et `addAgent` la lisent avec l'agence de la route ;
  `UserRoleController::update` avec `$targetAgencyId`.
- [x] Gardes : `tests/Feature/Api/AgencyMembersRolesDansLAgenceTest.php`, et dans
  `AgencyTeamRolesTest` le profil suspendu toujours visible dans les vues de la console (ADR-0005,
  point 3).

## Critères d'acceptation

- [x] AC1 — membre agent de A, admin et bailleur de B : la liste de A rend `["agent","customer"]`
  et `role_statuses = {"agent":"active"}`.
- [x] AC2 — agent suspendu de A : `["agent","customer"]`, `{"agent":"suspended"}`.
- [x] AC3 — `POST /agencies/{A}/members` d'un bailleur de B : `data.user.roles = ["agent","customer"]`.
- [x] AC4 — `PUT /users/{u}/role` `owner` dans A d'un agent de A, admin de B :
  `data.roles = ["owner","customer"]`.
- [x] AC5 — l'onglet Équipe de la console et la fiche d'un compte gardent les profils suspendus.

## Hors périmètre

- Le front : aucun écran ne rend aujourd'hui ces `roles` (P176.04, constat), et `role_statuses` est
  additif.
- `GET /api/users` (la liste d'équipe de `/app/agency/team`) ne rend pas `roles` (P176.06).

## Notes d'implémentation

- Ablation : les trois sites remis sur `UserResource::make()` / `profileTypes()` → 4 rouges sur 4 ;
  rétablis → verts.
- Le test de la console (AC5) garde un code inchangé : il est vert avant comme après, et c'est son
  objet (ADR-0005, point 3).
- Piège : la liste se résout par `map(… dansLAgence(…)->resolve($request))`, pas par `toArray()`.
  `UserResource::collection()->toArray()` passait par `resolve()`, qui retire les `whenHas` absents ;
  un `toArray()` par ligne les laissait, et `UserResourceSparseFieldsTest` a rougi (2 sur 4) sur
  `has_usable_password` et `two_factor_enabled` émis sous un sparse fieldset.
