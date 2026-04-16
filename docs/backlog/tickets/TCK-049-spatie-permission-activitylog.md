---
id: TCK-049
title: "Spatie Permission + ActivityLog Setup"
status: todo
phase: P0
family: back
estimate: M
created: 2026-04-16
updated: 2026-04-16
depends_on: [TCK-013]
blocks: [TCK-014, TCK-015, TCK-018, TCK-023]
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#26-audit--traçabilité
  models: [docs/models-spec.md#1-user]
tags: [back, infrastructure, spatie, permission, activitylog, policy]
---

## Objectif utilisateur

Les rôles et permissions sont installés et configurés, et chaque action critique est tracée automatiquement.

## Contrat de données

- Tables : `roles`, `permissions`, `role_has_permissions`, `model_has_roles`, `model_has_permissions`, `activity_log`
- Rôles seedés : `customer`, `agent`, `agency_admin`, `owner`, `service_provider`, `super_admin`
- Permissions par ressource : `{resource}.view`, `.create`, `.update`, `.delete`, `.update_all`
- `HasRoles` + `HasPermissions` traits sur User
- `LogsActivity` trait configurable par modèle
- Base Policy : `App\Policies\BasePolicy` avec helpers `viewAny`, `view`, `create`, `update`, `delete`

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Rôles et permissions scopés par agence (team) via teams mode spatie/permission
- `super_admin` bypass toutes les policies (before gate)
- Activity log ne capture pas les mots de passe ni les tokens
- Permissions en cache (spatie cache)
- Seul `super_admin` peut attribuer le rôle `super_admin`

## Delta à produire

- [ ] `composer require spatie/laravel-permission spatie/laravel-activitylog`
- [ ] Publication configs + migrations, teams mode activé
- [ ] Seeder `RolePermissionSeeder` : 6 rôles + permissions CRUD par ressource
- [ ] User model : `HasRoles`, `HasPermissions`
- [ ] `BasePolicy` avec before gate super_admin
- [ ] `LogsActivity` sur User, modèle de base pour autres entités
- [ ] Tests : `RolePermissionTest`, `ActivityLogTest`, `BasePolicyTest`

## Critères d'acceptation

- [ ] Les 6 rôles sont seedés et assignables
- [ ] Les permissions CRUD par ressource existent
- [ ] Un super_admin bypass toutes les policies
- [ ] L'activity log enregistre créations/mises à jour/suppressions
- [ ] Les mots de passe ne sont pas loggés

## Hors périmètre

- Attribution de rôles via UI (→ TCK-014)
- Rôles personnalisés par agence (→ TCK-014 P1)
- Export audit trail (→ P2)
