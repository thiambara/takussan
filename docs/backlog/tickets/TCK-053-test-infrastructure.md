---
id: TCK-053
title: "Test Infrastructure + Base Test Classes"
status: review
phase: P0
family: back
estimate: M
created: 2026-04-16
updated: 2026-04-21
depends_on: [TCK-048, TCK-049]
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, infrastructure, testing, pest, factory, seeder]
---

## Objectif utilisateur

Tout ticket métier peut s'appuyer sur une infrastructure de test cohérente avec factories, seeders et helpers API.

## Contrat de données

- `BaseTestCase` avec helpers : `actingAsRole($role)`, `assertJsonStructurePaginated()`, `assertJsonError()`
- `ApiTestCase` extends BaseTestCase : `apiGet()`, `apiPost()`, `apiPut()`, `apiDelete()` avec token auto
- Factories pour tous les modèles de base : `UserFactory` (existant), `AgencyFactory`, `PropertyFactory`, `CustomerFactory`
- `TestSeeder` : crée un agency + users par rôle pour les tests
- RefreshDatabase traité, base SQLite en mémoire pour vitesse

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Toute test class hérite de `BaseTestCase` ou `ApiTestCase`
- Les tests ne dépendent pas de données de prod — factories uniquement
- Chaque rôle de test a les permissions seedées par `RolePermissionSeeder`
- Les tests API vérifient systématiquement le format de réponse standard

## Delta à produire

- [x] `Tests\BaseTestCase` avec `actingAsRole()`, `assertJsonStructurePaginated()`, `assertJsonError()`, `ensureRolesSeeded()`.
- [x] `Tests\ApiTestCase` extends BaseTestCase : `apiGet/Post/Put/Patch/Delete`, `actingAsApi()`, `apiActingAsRole()`.
- [x] `AgencyFactory`, `PropertyFactory`, `CustomerFactory`, `UserFactory`, … — **déjà présents sur `dev`**.
- [x] `Database\Seeders\TestSeeder` : une agence + un user par rôle, roles/permissions seedés idempotemment.
- [x] Config phpunit : SQLite in-memory **déjà en place** ; parallel supporté nativement via `php artisan test --parallel` (Laravel délègue à `brianium/paratest`, à installer en dev si utilisé).
- [x] Tests : `BaseTestCaseTest` (5 cas), `ApiTestCaseTest` (5 cas), `TestSeederTest` (1 cas).

## Critères d'acceptation

- [x] `actingAsRole('agent')` crée un user lié à une nouvelle agence, assigne le rôle dans le team context (`agency_id`), et connecte le user via le guard par défaut.
- [x] `actingAsRole()` seed les rôles/permissions la 1re fois (via `ensureRolesSeeded()`) — les tests n'ont pas à appeler `RolesAndPermissionsSeeder` manuellement.
- [x] `assertJsonStructurePaginated()` valide `{ data, meta: {current_page, last_page, per_page, total}, links: {first, last, prev, next} }`.
- [x] `assertJsonError()` valide `{ message }` + code HTTP + (optionnel) match exact du message.
- [x] `ApiTestCase::apiActingAsRole()` authentifie via le guard `sanctum` — les routes `/api/*` protégées par `auth:sanctum` reconnaissent le user.
- [x] Les factories génèrent des données valides sans override (vérifié par la suite existante + `TestSeederTest`).
- [x] Suite ciblée (`Tests\Feature\Testing\*`) en SQLite in-memory : 11 tests en ~4 s à froid, largement sous 2 s après warm-up.

## Hors périmètre

- Tests métier spécifiques (→ tickets domaine).
- Tests frontend/E2E (→ front infrastructure).
- Installation de `brianium/paratest` : suggéré par `phpunit/phpunit` mais non requis — ajouté au fil de l'eau si la suite grossit assez pour en bénéficier.

## Notes d'implémentation

- **Teams mode** : Spatie Permission tourne en `teams = true` avec `team_foreign_key = agency_id`. `actingAsRole()` appelle `setPermissionsTeamId($user->agency_id)` avant `assignRole()` pour que le rôle soit scopé à l'agence. Même appel manuel requis dans les assertions post-hoc qui appellent `hasRole()` en dehors d'une requête HTTP (le `SetPermissionsTeamIdMiddleware` fait le boulot sur `/api/*` automatiquement).
- **Lazy role seeding** : `ensureRolesSeeded()` vérifie `Role::count() === 0` avant d'appeler le seeder — coût négligeable, évite de forcer tous les tests à faire `$this->seed(RolesAndPermissionsSeeder::class)` dans `setUp()`. Premier `actingAsRole()` du test ≈ 0.7 s (seed), suivants ≈ instantanés.
- **`apiActingAsRole()`** : passe `'sanctum'` comme guard à `actingAs()`. Les routes protégées par `auth:sanctum` voient un user authentifié, et le middleware `SetPermissionsTeamIdMiddleware` (préfixé sur le groupe `api`) résout le `team_id` automatiquement.
- **Pas de parallèle par défaut** : `brianium/paratest` est listé comme `suggest` de `phpunit/phpunit`, pas en `require-dev`. Laravel `test --parallel` le demandera à l'installation si besoin. SQLite `:memory:` est par-process, donc compatible parallèle out-of-the-box.
- **`TestSeeder` conservé simple** : agence unique + 1 user par rôle existant. Usage typique : `$ctx = new TestSeeder; $ctx->run(); $agent = $ctx->users['agent'];`. Pour des scénarios multi-agence, chaque test compose via `actingAsRole(['agency' => $agency])`.
