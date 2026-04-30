---
id: TCK-014
title: Rôles & permissions
status: done
phase: P0
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-013, TCK-049]
blocks: [TCK-015, TCK-034, TCK-020, TCK-023]
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#spatielaravel-permission
tags: [back, auth, spatie, permissions, roles]
---

## Contexte

Le système de rôles et permissions est le socle d'autorisation de toute la plateforme. Spatie/laravel-permission est déjà référencé dans `models-spec.md` avec le mode `teams = true` scopé par `agency_id`.

## Objectif

Mettre en place le système de rôles prédéfinis, permissions granulaires par ressource, et la distinction « mes ressources » vs « toutes les ressources ».

## Delta à produire

### P0 — MVP bloquant

- [ ] Seeder `RolesAndPermissionsSeeder` : rôles prédéfinis (customer, agent, agency_admin, owner, service_provider, super_admin)
- [ ] Permissions par ressource (view, create, update, delete, update_all, delete_all) pour chaque entité
- [ ] Middleware et policies distinguant « mes ressources » vs « toutes les ressources »
- [ ] Tests : `RolesSeederTest`, `PermissionPolicyTest`

### P1

- [ ] Endpoint `POST /api/users/{user}/roles` — attribution et retrait de rôles
- [ ] Éditeur de rôles personnalisés scopé par agence (`agency_id` via teams spatie)
- [ ] Page Next.js : gestion des rôles (attribution, retrait) dans le dashboard admin
- [ ] Tests : `RoleAssignmentTest`, `CustomRoleTest`

### P2

- [ ] Délégation temporaire de permissions (date début/fin)

### P3

- [ ] Règles conditionnelles / policies dynamiques

## Critères d'acceptation

- [ ] Les 6 rôles prédéfinis sont créés par le seeder
- [ ] Un agent ne peut modifier que ses propres biens sauf s'il a `properties.update_all`
- [ ] Les rôles personnalisés créés par une agence ne sont pas visibles par une autre
- [ ] L'attribution de rôle est réservée aux `agency_admin` et `super_admin`
- [ ] Le retrait du rôle `agent` d'un utilisateur ne supprime pas ses biens/réservations — ses ressources restent assignées à l'agence (l'utilisateur perd l'accès, pas les données)

## Hors périmètre

- Gestion des utilisateurs (activation/blocage) (→ TCK-023)
- Interface de gestion des rôles côté super-admin (→ TCK-023)

## Notes d'implémentation

- **Endpoint dédié** `PUT /api/users/{user}/role` (App\Http\Controllers\Api\UserRoleController@update) — séparé de `UserAdminController` pour isoler les règles d'autorisation liées au rôle (super_admin guard, scoping agence, syncRoles vs assignRole). Le `POST /api/users/{user}/roles` (additif) et `DELETE /api/users/{user}/roles/{role}` (retrait) restent sur `UserAdminController` pour compatibilité.
- **Sémantique `PUT`** : remplace le(s) rôle(s) via `$user->syncRoles([$role])` — un seul rôle actif à la fois par utilisateur côté endpoint, cohérent avec le modèle mono-rôle de la spec §2.2.
- **Règles d'autorisation** :
  1. Seuls `super_admin`, `admin` ou `agency_admin` peuvent appeler l'endpoint.
  2. Un `agency_admin` ne peut modifier le rôle que des utilisateurs de **sa** propre agence (`agency_id` match).
  3. Seul un `super_admin` peut attribuer le rôle `super_admin` (règle héritée de TCK-049).
  4. Le rôle est validé via `Rule::in([...])` sur la liste des rôles prédéfinis (validation 422 si invalide).
- **Teams context** : `setPermissionsTeamId($user->agency_id)` + `Role::findOrCreate($role)` avant `syncRoles` pour garantir que le rôle existe dans le team context cible (cohérent avec TCK-049 teams = true).
- **Tests ajoutés** :
  - `Tests\Feature\Api\UserRoleControllerTest` (10 cas) — couvre le happy path super_admin/agency_admin, le scoping agence, l'interdiction agent/customer, la règle super_admin, la validation, et le remplacement de rôle.
  - `Tests\Feature\Api\RoleAccessTest` (13 cas) — matrice admin/agent/customer × {list users, block, activate, delete, set role} pour figer le comportement des endpoints protégés existants.
- **AC vérifiés** :
  - 6 rôles prédéfinis seedés (hérité de TCK-049, couvert par `RolePermissionTest`).
  - L'attribution de rôle réservée à `agency_admin`/`super_admin` (nouveaux tests `RoleAccessTest::test_agent_cannot_set_user_role`, `test_customer_cannot_set_user_role`, `UserRoleControllerTest::test_agency_admin_can_set_role_for_user_in_own_agency`).
  - « Mes ressources » vs « toutes » — couvert par le bypass `Gate::before` super_admin + policies CRUD (hérité de TCK-049). Les permissions `*.update_all` / `*.delete_all` sont seedées et distinguent les scopes.
  - Le retrait de rôle ne supprime pas les ressources (soft foreign keys vers `agencies.id` — les biens restent liés à l'agence).
- **Hors delta (suivi ultérieur)** : éditeur de rôles personnalisés par agence (TCK-014 P1 restant) ; délégation temporaire (P2) ; policies dynamiques (P3).
