---
id: TCK-1069
title: "La création d'une tâche n'énumère plus les comptes de la plateforme ni les fiches des autres agences"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-62--règles-exists-des-routes-ouvertes-à-tout-compte-connecté--oracles-dexistence"
tags: [api, autorisation, oracle, pistes]
---

## Contexte

Réf : **P62.03** du fichier de pistes, `validé` (V2). `StoreTaskRequest::authorize()` rend `true`,
et `assigned_to_id` porte `exists:users,id`, jugé avant la résolution du parent : un compte absent
rend 422, un compte existant passe. Tout compte connecté énumère ainsi `users`, ce que TCK-817 a
fermé sur `bulk-assign` (P22.02). Le parent (`taskable_id`) est résolu par `findOrFail()` avant
`authorize('attachTo')` : une fiche tierce rend 403, une fiche absente 404.

## Décision du porteur

> (a) comme P62.01 : retirer `exists:users,id` et rendre 404 quand `attachTo` refuse, comme `DocumentController::store()` (porteur, 2026-10-20)

## Objectif

Compte absent et compte existant, parent absent et parent tiers : mêmes réponses.

## Delta à produire

- [x] `StoreTaskRequest` : `assigned_to_id` passe à `['nullable', 'integer']`.
- [x] `TaskController::store()` : un parent absent ou refusé par `attachTo` rend 404.
- [x] `TaskController::authorizeAssignee()` : le super-admin, qui ne passe par aucun contrôle de
      personnel, reçoit `task.assignee_not_staff` pour un compte absent.
- [x] `ExistsSurRouteOuverteTest` : l'exception `StoreTaskRequest` (P62.03) est retirée.
- [x] Tests : `TaskExistenceOracleTest`. `TaskTest::test_user_cannot_attach_task_to_another_users_record`
      et `TaskAuthorizationTest::test_a_landlord_cannot_attach_a_task_to_a_customer_he_did_not_add`
      attendent désormais 404.

## Critères d'acceptation

- [x] AC1 : face à un parent absent, un assigné absent et un assigné existant rendent le même 404.
- [x] AC2 : une fiche client ou un bien d'une agence tierce rendent le 404 d'un parent absent.
- [x] AC3 : sur son propre parent, un assigné absent rend la 422 `task.assignee_not_staff` d'un
      assigné hors personnel.
- [x] AC4 : un assigné non entier rend 422, jamais 500 ; le super-admin ne peut pas assigner un
      compte absent.

## Hypothèses (mode sans humain)

- **Le contrôle du super-admin est ajouté.** Sans `exists:`, son chemin (qui court-circuite le
  contrôle de personnel) aurait écrit un `assigned_to_id` absent, soit une violation de clé
  étrangère (500). Mesuré par le test avant correctif : 422 de validation sans code. Après : la 422
  `task.assignee_not_staff` des autres appelants. `authorizeAssignee()` sert aussi la modification
  de tâche, qui garde son `exists:` (route non ouverte) : rien n'y change hors du super-admin.

## Hors périmètre

- `UpdateTaskRequest` (son `authorize()` délègue à la policy).
- P62.04 à P62.07.

## Notes d'implémentation

- Avant correctif : 5 rouges sur 5, dont `assigned_to_id=abc` → 500 (`exists:` sur PostgreSQL).
  Ablations : FormRequest d'origine → 4 rouges ; contrôleur d'origine → 2 rouges (parent tiers en
  403, super-admin). 55 tests sur les classes qui citent la route : 1 rouge attendu (403 → 404), réaligné.
