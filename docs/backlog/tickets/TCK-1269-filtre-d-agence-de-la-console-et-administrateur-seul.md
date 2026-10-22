---
id: TCK-1269
title: "Console des utilisateurs : le filtre d'agence compte l'administrateur d'agence seul, par la portée commune"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-119--requêtes-de-base-passées-à-buildquery-et-querybuilderfor"
tags: [api, console, utilisateurs, agence, pistes]
---

## Contexte

Réf : **P119.01** du fichier de pistes, `validé (délégué)`.

« Membre de l'agence » s'écrivait par deux branches (`agentProfiles` OU `ownerProfiles`) sous
trois bases. TCK-1244 (P120.02) a posé la portée commune `User::scopeMembreDe()` à trois branches
sous `GET /api/agencies/{id}/members` et `GET /api/admin/agencies/{id}/team`, et fait envoyer
`filter[role]=agent,owner` aux candidats à une délégation. Reste la troisième base : le
`filter[agency_id]` de `GET /api/admin/users` (`Admin\UserDetailController::index`), qui omet
toujours l'administrateur d'agence sans profil d'agent ni de bailleur.

## Décision du porteur (déléguée)

« validé (délégué) — une portée unique « personne qui tient un profil dans l'agence » à trois branches (`agentProfiles`, `ownerProfiles`, `agencyAdminProfiles`), celle de `UserAdminController` (TCK-277), posée sous `GET /api/agencies/{id}/members`, `GET /api/admin/agencies/{id}/team` et le `filter[agency_id]` de `GET /api/admin/users` ; les candidats à une délégation gardent exactement la condition du service (`isAgentAt || isOwnerAt`) par un filtre envoyé depuis `useDelegationCandidates`, sans tri côté client ; à traiter avec P120.02 »

Critère accordé : V7.

## Objectif

Le filtre d'agence de la console des utilisateurs rend tout membre de l'agence, administrateur
seul compris, par la même portée que les deux autres listes.

## Delta à produire

- [x] `filter[agency_id]` de `GET /api/admin/users` passe par `User::membreDe()`.
- [x] Un test : un administrateur seul et un agent de l'agence sont rendus, un utilisateur d'une
      autre agence ne l'est pas.

## Critères d'acceptation

- [x] AC1 — `GET /api/admin/users?filter[agency_id]={id}` rend l'administrateur seul de l'agence
      et son agent, et pas l'agent d'une autre agence.

## Hors périmètre

- `GET /api/agencies/{id}/members`, `GET /api/admin/agencies/{id}/team` et les candidats à une
  délégation : faits par TCK-1244.
- Une valeur non numérique de `filter[agency_id]` (500) : P119.03, TCK-1273.

## Notes d'implémentation

- Test : `tests/Feature/Admin/Platform/FiltreDAgenceDeLaConsoleTest.php`. Avant correctif, la
  liste rend le seul agent (l'administrateur seul manque).
- Ablation : base remise à deux branches (`agentProfiles`/`ownerProfiles`) → rouge ; correctif
  remis → vert.
- `(int)` sur la valeur : une valeur non numérique se règle en 400 par P119.03 (TCK-1273).
