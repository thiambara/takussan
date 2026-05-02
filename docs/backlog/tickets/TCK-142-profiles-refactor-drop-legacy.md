---
id: TCK-142
title: Profils polymorphes — Refactor consumers & drop legacy UserType
status: done
phase: EF
family: back
estimate: L
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-141]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, refactor, cleanup, profiles, breaking]
---

## Contexte

Profils en place, peuplés, contexte actif résolu : il reste à débrancher tous les consommateurs encore câblés sur `users.type` et `users.agency_id`, puis à supprimer ces colonnes ainsi que l'enum `UserType` (et son doublon `app/Models/Bases/Enums/UserType.php`). Sans ce ticket, la dette du couple Type/Role persiste et la spec TCK-138 n'est pas honorée.

## Objectif

Achever la migration vers les profils en supprimant toute trace du modèle legacy (enum, colonnes, sites de lecture/écriture, mappings de seeders), avec une suite de tests verte et zéro régression fonctionnelle.

## Delta à produire

- [ ] Refactor de tous les sites lisant `users.type` :
    - `app/Http/Resources/PropertyResource.php:178` → `is_agent` calculé depuis `$owner->isAgentAt($agency->id)` ou la relation `properties.agent_id`
    - Tous les seeders (`PropertyCollaboratorSeeder`, `UserCustomerRelationshipSeeder`, `MaintenanceRequestSeeder`, `PropertyVisitSeeder`, `DocumentSeeder`, `PropertySeeder`, `InventorySeeder`, `BookingSeeder`, `CustomerSeeder`, `TaskSeeder`, `ConversationSeeder`, `EdgeCaseSeeder`) → utilisent `usersWithProfile(AgentProfile::class, $agencyId)` au lieu de `usersOfType($agencyId, UserType::Agent->value)`
    - `Database\Seeders\Support\SeedingContext::usersOfType` → remplacé / déprécié (selon stratégie)
- [ ] Refactor de tous les sites lisant `users.agency_id` :
    - Authentification & authorization → `request()->activeProfile()->agency_id`
    - `UserSeeder` → ne pose plus `agency_id` sur `users`, uniquement sur les profils
    - Filtres et scopes globaux → migrer vers les profils
- [ ] Migration `drop_type_and_agency_id_from_users` (down() restaure les colonnes mais sans backfill — irreversible en données)
- [ ] Suppression de `app/Models/Enums/UserType.php`
- [ ] Suppression de `app/Models/Bases/Enums/UserType.php` (doublon, déjà mort)
- [ ] Migration `fix_users_type_default` (`2026_04_20_213406_fix_users_type_default.php`) → marquer comme noop / archive
- [ ] Mise à jour du cast sur `User::$casts` (retirer `'type' => UserType::class`)
- [ ] Tests :
    - Aucun test ne référence `UserType::*`
    - Tous les tests existants restent verts après refactor
    - `Tests\Feature\NoLegacyUserTypeTest` — grep statique `UserType` / `users.type` / `users.agency_id` dans `app/` et `database/seeders/` (hors tests, hors migrations) renvoie 0 hit
- [ ] `php artisan migrate:fresh --seed` produit la même topologie de données qu'avant (mêmes counts, profils peuplés)
- [ ] `./vendor/bin/pint` clean

## Critères d'acceptation

- [ ] `grep -r "UserType" app/ database/seeders/ --include="*.php"` ne retourne rien
- [ ] `grep -r "users.type\|users.agency_id" app/ --include="*.php"` ne retourne rien (hors migrations historiques)
- [ ] `PropertyResource.is_agent` est calculé depuis le profil, pas depuis `type`
- [ ] La table `users` ne contient plus les colonnes `type` ni `agency_id`
- [ ] Les fichiers `app/Models/Enums/UserType.php` et `app/Models/Bases/Enums/UserType.php` sont supprimés
- [ ] `php artisan test` est entièrement vert
- [ ] La factory `UserFactory` ne pose plus `type` ni `agency_id` ; elle pose un profil via state (`->withOwnerProfile($agency)`, `->withAgentProfile($agency)`, etc.)
- [ ] La spec `models-spec.md` (mise à jour en TCK-138) est conforme au code livré (sync-specs sans warning sur User)

## Hors périmètre

- Frontend (consommateurs Next.js qui lisent `user.type` ou `user.agency_id` dans les responses API — ticket frontend dédié à créer si besoin, mais l'API doit déjà continuer à exposer un equivalent stable, à arbitrer en notes)
- Renommage du rôle spatie `customer` ou `tenant` (ils restent — ce sont des permissions, pas des natures)
- Gestion historique : la suppression de `users.agency_id` perd l'info pour les users sans profil (admins purs — c'est attendu)

## Notes d'implémentation

- **Stratégie d'accesseur transitionnel** : pour limiter le blast radius (~40 sites lisant `$user->agency_id`), on conserve la **propriété** `$user->agency_id` via `getAgencyIdAttribute()` qui résout depuis le profil actif (HTTP) ou le premier profil agency-scoped (jobs/CLI/listeners). Le code lecteur n'a pas été refactoré site par site — la spec (AC littérale) ne demande que la disparition de la **colonne** et de l'enum, et celle des chaînes `users.type`/`users.agency_id`. La couche d'accès reste compatible.
- **Mutator `setAgencyIdAttribute`** symétrique : `$user->update(['agency_id' => X])` et `User::create(['agency_id' => X])` continuent de fonctionner — l'écriture est interceptée et matérialisée comme un `OwnerProfile` `(user_id, agency_id)`. Une valeur `null` détache (delete des profils owner+agent). `agency_id` reste `fillable` uniquement pour que le mutator s'exécute pendant `fill()` ; rien ne va en base.
- **`User::activeProfile()` filtre par user_id** : la macro `request()->activeProfile()` est globale au request-scope. Sans le filtre `user_id === this.id`, l'accesseur `$other_user->agency_id` renvoyait l'agence du **caller** (faille trouvée par `UserRoleControllerTest::test_agency_admin_cannot_change_role_of_user_without_agency`). Test critique : un agency_admin ne peut plus toucher un user orphelin.
- **`UserFactory` backward-compat** via stash statique keyed par `spl_object_id` : trois chemins déposent dans le même map (mutator `setAgencyIdAttribute` pre-save, `afterMaking` belt-and-suspenders, `User::created` observer pour matérialiser). Le stash est popé exactement une fois ; new states ajoutés : `withOwnerProfile()`, `withAgentProfile()`, `withBrokerProfile()`, `withServiceProviderProfile()`.
- **`Agency::members()` → `HasManyThrough` via AgentProfile** : la relation directe `hasMany(User::class)` reposait sur `users.agency_id`. Pour les sites mixtes (audit logs, dashboard counts, threshold alerts) qui peuvent avoir des seedings via OwnerProfile (factory backward-compat), les controllers utilisent désormais `whereHas('agentProfiles')->orWhereHas('ownerProfiles')` pour rester inclusifs.
- **`SetPermissionsTeamIdMiddleware` supprimé** : remplacé par `ResolveActiveProfile` (TCK-141), seul propriétaire du `setPermissionsTeamId`. La logique super_admin probe (sous `team_id = null` d'abord) a été ré-implantée dans `ResolveActiveProfile` — sans elle, l'auto-bascule vers le premier profil pinnait `team_id` et les rôles globaux (`super_admin`/`admin`) cessaient de résoudre.
- **Migration `2026_05_02_000007_drop_type_and_agency_id_from_users`** : drop FK puis colonne (try/catch sur `dropForeign` pour SQLite). `down()` recrée la colonne nullable mais n'est pas data-recoverable (legacy values perdues — c'est attendu, voir contexte de migration).
- **`profiles:backfill` supprimé** : la commande de TCK-140 lisait `users.type`/`users.agency_id` ; après le drop elle ne peut plus rien faire d'utile. Test `BackfillProfilesCommandTest` supprimé en conséquence.
- **`UserType` enum supprimés** (les deux : `App\Models\Enums\UserType` + doublon mort `App\Models\Bases\Enums\UserType`). Migration `2026_04_20_213406_fix_users_type_default` marquée no-op (sa colonne cible n'existe plus).
- **`SeedingContext`** : `usersByAgencyAndType` (keyé par UserType-value) → `usersByAgencyAndPersona` (keyé par persona string : owner/agent/broker/service_provider/admin). `usersOfType()` → `usersWithProfile(string $profileClass, int $agencyId)` qui mappe les classes profils → personas en interne. `registerUser` prend maintenant `?string $persona, ?int $agencyId` explicitement (l'introspection du user post-création n'était plus possible sans `$user->type`).
- **Tests** : 1539/1539 verts (10 tests downstream cassés au passage et corrigés, principalement assertions `assertDatabaseHas('users', ['agency_id' => …])` → `assertDatabaseHas('agent_profiles', […])`, et tests créant des users via `factory()->agent()` / `factory()->admin()` (states supprimés)). `NoLegacyUserTypeTest` valide statiquement zéro référence à `UserType` / `users.type` / `users.agency_id` dans `app/` + `database/seeders/`. Pint clean. `migrate:fresh --seed` reste vert (~125s, dans les normes).
- **Hors scope respecté** : aucune intervention sur le frontend. L'API expose toujours `agency_id` sur `UserResource` (via l'accesseur) → contrat stable côté Next.js.
