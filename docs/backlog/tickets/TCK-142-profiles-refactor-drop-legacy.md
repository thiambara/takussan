---
id: TCK-142
title: Profils polymorphes — Refactor consumers & drop legacy UserType
status: todo
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

_(à remplir par implementing-specs)_
