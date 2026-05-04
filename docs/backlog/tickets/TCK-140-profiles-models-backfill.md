---
id: TCK-140
title: Profils polymorphes — Modèles, relations, backfill
status: done
phase: EF
family: back
estimate: L
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-139]
blocks: [TCK-141]
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, eloquent, profiles, backfill, seeders]
---

## Contexte

Le schéma de profils existe (TCK-139) mais n'est pas encore exposé au code applicatif. Ce ticket câble les modèles Eloquent, les relations sur `User`, et fournit la commande de backfill qui projette l'état actuel (`users.type` + `users.agency_id`) vers les nouvelles tables de profils — étape obligatoire pour rendre le code consommateur (TCK-141, TCK-142) opérationnel sans interruption de service.

## Objectif

Mettre à disposition des profils Eloquent typés, navigables depuis `User`, avec une commande artisan de backfill testable et idempotente, et un `UserSeeder` mis à jour qui peuple les profils en plus du legacy `type`/`agency_id`.

## Delta à produire

- [ ] Modèles `App\Models\Profiles\OwnerProfile`, `AgentProfile`, `BrokerProfile`, `ServiceProviderProfile` (cast, fillable, soft delete, scopes `active()` / `withinAgency($id)`)
- [ ] Modèles pivot `BrokerAgencyCollaboration`, `ServiceProviderAgencyCollaboration`
- [ ] Trait `App\Models\Concerns\HasProfiles` sur `User` exposant : `ownerProfiles()`, `agentProfiles()`, `brokerProfile()`, `serviceProviderProfile()`, `profiles()` (collection union), `hasProfile(string $class, ?int $agencyId = null)`, `isProfessional()`
- [ ] Helper `User::isAgentAt(int $agencyId)`, `isOwnerAt`, `isProviderAt` — remplaçants des futurs sites consultant `type`
- [ ] Command `App\Console\Commands\Profiles\BackfillProfilesCommand` (`php artisan profiles:backfill {--dry-run} {--chunk=500}`) :
    - `UserType::Individual` + `agency_id` → `OwnerProfile` (status inféré depuis le rôle spatie courant : `owner` / `tenant` / `customer`)
    - `UserType::Agent` + `agency_id` → `AgentProfile`
    - `UserType::Broker` + `agency_id` → `BrokerProfile` + collaboration avec l'agence
    - `UserType::ServiceProvider` + `agency_id` → `ServiceProviderProfile` + collaboration
    - `UserType::Admin` → aucun profil (rôles spatie suffisent)
- [ ] `UserSeeder` mis à jour : créer le profil correspondant à chaque user créé (en plus du legacy)
- [ ] Factories `OwnerProfileFactory`, `AgentProfileFactory`, `BrokerProfileFactory`, `ServiceProviderProfileFactory`
- [ ] Tests :
    - `Tests\Feature\Models\HasProfilesTraitTest` (relations, hasProfile, isAgentAt)
    - `Tests\Feature\Console\BackfillProfilesCommandTest` (dry-run, idempotence, mapping correct par UserType, chunking)
    - `Tests\Feature\Database\Seeders\UserSeederProfilesTest` (chaque persona créée a son profil)
- [ ] `./vendor/bin/pint` clean
- [ ] `php artisan migrate:fresh --seed` reste vert

## Critères d'acceptation

- [ ] `php artisan profiles:backfill --dry-run` n'écrit rien et liste les profils qui seraient créés
- [ ] `php artisan profiles:backfill` est idempotent (deuxième run ne crée pas de doublon — `firstOrCreate` ou équivalent)
- [ ] Après backfill, `count(users where type='agent')` == `count(agent_profiles)` et idem pour les autres types
- [ ] `$user->isAgentAt($agency->id)` retourne `true` ssi un `AgentProfile` actif existe pour `(user_id, agency_id)`
- [ ] `$user->profiles()` renvoie une collection unifiée (Eloquent `Collection`) qui peut contenir des profils de classes différentes
- [ ] Le `UserSeeder` après refresh produit 1 profil par user créé (sauf admins)
- [ ] Aucun site existant consultant `users.type` ou `users.agency_id` n'est modifié dans ce ticket
- [ ] Les tests backend existants restent verts

## Hors périmètre

- Refactor des sites lisant `users.type` / `users.agency_id` (TCK-142)
- Endpoints API et middleware de profil actif (TCK-141)
- Suppression des colonnes legacy (TCK-142)
- UI de gestion / switch de profil (ticket frontend ultérieur)

## Notes d'implémentation

- **Bug latent évité**: `Eloquent\Collection::merge()` clé par PK et écrase silencieusement les profils de classes différentes partageant un id (ex. OwnerProfile #1 + AgentProfile #1). `HasProfiles::profiles()` utilise `concat()` pour préserver les 4 entrées. Test ad-hoc `test_profiles_returns_unified_collection_with_mixed_classes` couvre.
- **Pattern `BRK-LEGACY-{userId}-{rand}`** dans BackfillProfilesCommand: `broker_profiles.license_number` est unique. Pour les users `Broker` legacy sans licence en base, on génère une valeur déterministe par user pour garantir l'idempotence (`firstOrCreate` sur `user_id`) sans collision entre runs.
- **UserSeeder.seedProfileFor**: chaque user créé reçoit son profil via `firstOrCreate` sur `(user_id, agency_id)` → idempotent, autorise un re-seed sans doublon. Admins ne reçoivent rien (rôles spatie suffisent).
- **`hasProfile`/`isAgentAt` ignorent les soft-deletes** explicitement via `whereNull('deleted_at')` — le `SoftDeletes` du modèle filtre déjà mais le whereExists() a besoin d'être explicite côté requête.
- **3 enums livrés ici** au lieu de TCK-139 (timing): `OwnerProfileStatus`, `AgentProfileStatus`, `CollaborationStatus`. Les modèles les castent ; le schéma ne les contraint pas (string par défaut).
- **Tests**: 18 tests verts (8 HasProfilesTraitTest + 9 BackfillProfilesCommandTest + 1 UserSeederProfilesTest). Suite complète : 1526/1526.
