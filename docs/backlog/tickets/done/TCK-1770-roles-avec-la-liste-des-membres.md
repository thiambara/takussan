---
id: TCK-1770
title: "Les affectations de rôle viennent avec la liste des membres de l'écran Équipe"
status: done
phase: P2
family: full
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-136--lectures-du-navigateur-au-chargement-de-la-console-app-et-super-admin"
tags: [api, front, equipe, roles, performance, pistes]
---

## Contexte

Réf : **P136.04** du fichier de pistes, `validé` (V7 accordé).

`TeamConsole` lisait la page de membres (`GET /api/users` par le relais `/api/admin-users`), puis,
la réponse reçue, demandait `GET /api/agencies/{id}/role-assignments` pour les identifiants de la
page : deux allers-retours en série avant la colonne « Rôle », à chaque page ou filtre.

## Décision du porteur

> porteur (2026-10-22) : inclure les affectations de rôle, bornées à la page, dans la liste des membres, jugées par la règle de lecture des rôles d'aujourd'hui ; test « un seul appel suffit »

## Objectif utilisateur

L'administrateur voit la colonne « Rôle » de l'écran Équipe en même temps que la liste.

## Contrat de données

- `GET /api/users?with_role_assignments=1` : `meta.role_assignments`, la même forme que
  `GET /api/agencies/{agency}/role-assignments` (`profile_id`, `profile_type`, `user_id`,
  `agency_role_id`, `agency_role_name`), pour les seules lignes de la page, dans l'agence active.
- Sans le paramètre, la réponse ne change pas.

## Contraintes strictes (métier)

- Même règle que `role-assignments` : `AgencyRolePolicy::viewAny` (`team.assign_role`). Un lecteur
  de la liste qui ne la tient pas (`team.invite` seul) reçoit la liste sans `role_assignments`,
  comme il reçoit 403 là-bas.
- Bornées à la page : aucune affectation d'un membre hors des lignes rendues.

## Delta à produire

- [x] Service `App\Services\Membership\AffectationsDeRole::pour(Agency, userIds)` : la lecture
  d'aujourd'hui, partagée par `RoleController::assignments` et `UserAdminController::index`.
- [x] `UserAdminController::index` : `meta.role_assignments` sur `with_role_assignments=1`, si
  `viewAny` sur les rôles de l'agence active.
- [x] Front : `fetchAdminUsers` le demande ; `TeamConsole` lit `meta.role_assignments` et ne fait
  plus le second appel ; renommer un rôle invalide aussi la liste des membres.
- [x] Tests : `UserAdminRoleAssignmentsTest` (4 cas) ; vitest « un seul appel suffit ».

## Critères d'acceptation

- [x] AC1 — la liste rend, sur demande, les affectations identiques à celles de `role-assignments`.
- [x] AC2 — bornées aux lignes de la page.
- [x] AC3 — un lecteur sans `team.assign_role` ne les reçoit pas ; sans le paramètre, rien ne change.
- [x] AC4 — l'écran Équipe affiche le rôle par un seul appel, sans `role-assignments`.

## Hors périmètre

- `GET /api/agencies/{agency}/role-assignments` reste en place (même lecture) ; le hook
  `useAgencyRoleAssignments` n'a plus d'appelant de production, son retrait est laissé à part.

## Notes d'implémentation

- Choix (voie la plus étroite) : un paramètre explicite, `with_role_assignments=1`, plutôt qu'un
  `include=` spatie : les affectations ne sont pas une relation de `User`, et la liste reste
  inchangée pour les autres appelants.
- Ablation : front (`TeamConsole.tsx`, `admin-users.ts` à `HEAD`) → 1 rouge sur 1 ; API (`app/` à
  `HEAD`, service retiré) → 2 rouges sur 4, les deux cas négatifs restant verts comme il se doit ;
  correctifs remis → 4/4 et 1/1 verts.
