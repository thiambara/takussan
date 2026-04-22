---
id: TCK-049
title: "Spatie Permission + ActivityLog Setup"
status: done
phase: P0
family: back
estimate: M
created: 2026-04-16
updated: 2026-04-22
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

- [x] `composer require spatie/laravel-permission spatie/laravel-activitylog` — **déjà installé** sur `dev`.
- [x] Publication configs + migrations, teams mode activé (`team_foreign_key = agency_id`, `teams = true`) — **déjà en place** (migrations `2026_04_17_154616_create_permission_tables`, `create_activity_log_table`, `make_permission_team_id_nullable`).
- [x] Seeder `System\RolesAndPermissionsSeeder` : 8 rôles (`super_admin`, `admin`, `agency_admin`, `agent`, `owner`, `tenant`, `customer`, `service_provider`) — couvre les 6 requis + extras. Permissions CRUD `{resource}.{view|create|update|delete|update_all|delete_all}` pour 17 ressources — **déjà en place** sur `dev`.
- [x] User model : `HasRoles` trait (couvre roles ET permissions — Spatie Permission n'a pas de trait `HasPermissions` séparé) — **déjà en place**.
- [x] `App\Policies\BasePolicy` abstraite : helpers `viewAny`, `view`, `create`, `update`, `delete` mappés sur `{resource()}.{action}`.
- [x] `Gate::before` global dans `AppServiceProvider::boot()` → `super_admin` bypass toutes les policies.
- [x] `LogsActivity` trait sur User (`Spatie\Activitylog\Models\Concerns\LogsActivity` en v5) avec `logOnly` whitelist (aucun champ sensible) + `dontLogIfAttributesChangedOnly` (short-circuit quand seul password/tokens/timestamps changent).
- [x] Tests : `RolePermissionTest` (5 cas), `BasePolicyTest` (6 cas), `ActivityLogTest` (6 cas).

## Critères d'acceptation

- [x] Les 6 rôles requis sont seedés et assignables (+ 2 extras : `admin`, `tenant`).
- [x] Les permissions CRUD par ressource existent (17 ressources × 6 actions).
- [x] Un `super_admin` bypass toutes les policies via `Gate::before` global (vérifié par `BasePolicyTest::test_super_admin_bypasses_all_policy_checks_via_gate_before`).
- [x] L'activity log enregistre créations/mises à jour/suppressions (`created`, `updated`, `deleted` via `LogsActivity` trait).
- [x] Les mots de passe et `remember_token` et secrets 2FA ne sont **jamais** loggés : exclus de `logOnly`, et `dontLogIfAttributesChangedOnly` empêche même la création d'un log vide si seul un champ sensible change.

## Hors périmètre

- Attribution de rôles via UI (→ TCK-014).
- Contrainte "seul super_admin peut attribuer super_admin" — rule d'assignation à implémenter au niveau service/policy lors de TCK-014 (pas d'endpoint d'assignation dans ce ticket).
- Rôles personnalisés par agence (→ TCK-014 P1).
- Export audit trail (→ P2).
- `LogsActivity` sur les autres modèles (Property, Booking, …) — adoption au fil de l'eau sur les tickets domaine.

## Notes d'implémentation

- **`super_admin` bypass via `Gate::before`** plutôt que `BasePolicy::before()` : un seul point de vérité, couvre aussi les `Gate::check()` non-policy. Règle unique : `fn (User $user) => $user->hasRole('super_admin') ? true : null`. Retourne `null` (pas `false`) pour déléguer à la policy quand l'user n'est pas super_admin — sinon on bloquerait toute autorisation.
- **Teams-mode et `hasRole`** : `hasRole('super_admin')` requiert que le team context soit set. En HTTP, `SetPermissionsTeamIdMiddleware` le gère à partir du token sanctum ; en test, `BaseTestCase::actingAsRole()` le fait aussi. Pour un super_admin cross-agence : même `hasRole` fonctionne tant que le rôle est assigné dans le team context courant de l'user.
- **`LogsActivity` v5** : la trait a migré de `Spatie\Activitylog\Traits\LogsActivity` → `Spatie\Activitylog\Models\Concerns\LogsActivity`. Les changements d'attributs sont stockés dans la colonne `attribute_changes` (collection cast) — **pas** `properties` comme en v4. Ancienne doc caduque.
- **`dontSubmitEmptyLogs` renommé** → `dontLogEmptyChanges` en v5.
- **Protection password/tokens** : double garde — (1) `logOnly` whitelist n'inclut pas les champs sensibles, donc leurs valeurs ne peuvent pas remonter, et (2) `dontLogIfAttributesChangedOnly(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes', 'updated_at', 'last_login_at'])` short-circuite `shouldLogEvent()` pour éviter même la création d'un log "updated" vide quand seul un champ sensible a changé.
- **Impact sur `AuditLogTest` existant** : les tests qui créent des `User` via factory voient maintenant 1 entrée `created` auto-loguée en plus de leurs fixtures manuelles. Compteurs ajustés à 2 dans `test_admin_can_list_audit_logs` / `test_admin_can_get_audit_logs_by_entity`.
