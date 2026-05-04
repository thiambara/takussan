---
id: TCK-139
title: Profils polymorphes — Schéma & migrations
status: done
phase: EF
family: back
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-138]
blocks: [TCK-140]
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, db, migrations, profiles, identity]
---

## Contexte

Premier livrable d'implémentation de la spec validée en TCK-138 : matérialiser en base les tables de profils polymorphes (`owner_profiles`, `agent_profiles`, `broker_profiles`, `service_provider_profiles`) et leurs pivots multi-agences, sans encore toucher au code applicatif (modèles, controllers, seeders) qui restent câblés sur l'ancien schéma. Les colonnes legacy `users.type` et `users.agency_id` sont conservées intactes — elles disparaîtront en TCK-142 après backfill et cutover.

## Objectif

Livrer un jeu de migrations Laravel idempotentes qui crée le schéma de profils décrit par la spec, avec les contraintes d'unicité, FK et soft delete, sans casser la suite de tests existante.

## Delta à produire

- [ ] Migration `create_owner_profiles_table` (`user_id`, `agency_id`, `status`, `rib`, `tax_id`, `id_document_type`, `id_document_number`, `monthly_income`, `employer`, `guarantor_user_id`, `metadata`, `created_at`, `updated_at`, `deleted_at` — unique `(user_id, agency_id)`)
- [ ] Migration `create_agent_profiles_table` (`user_id`, `agency_id`, `status`, `license_number`, `commission_rate`, `specialty`, `hire_date`, `active_until`, `metadata`, soft delete — unique `(user_id, agency_id)`)
- [ ] Migration `create_broker_profiles_table` (`user_id` unique, `license_number` unique, `insurance_policy_id`, `regulator_registration`, `active_until`, `metadata`, soft delete)
- [ ] Migration `create_service_provider_profiles_table` (`user_id` unique, `specialties` json, `service_areas` json, `insurance_policy_id`, `certifications` json, `hourly_rate_min`, `hourly_rate_max`, `active_until`, `metadata`, soft delete)
- [ ] Migration `create_broker_agency_collaborations_table` (pivot `broker_profile_id` × `agency_id`, `started_at`, `ended_at`, `status`, unique `(broker_profile_id, agency_id)`)
- [ ] Migration `create_service_provider_agency_collaborations_table` (même pattern, pivot `service_provider_profile_id` × `agency_id`)
- [ ] Index FK + index secondaires sur `agency_id`, `status`, `deleted_at` quand pertinent
- [ ] Tests : `Tests\Feature\Database\ProfileSchemaTest` (chaque migration up/down, contraintes d'unicité, cascade soft delete, FK violations 23xxx)
- [ ] `php artisan migrate:fresh --seed` reste vert sur la base de tests (sans utiliser les nouvelles tables)
- [ ] `./vendor/bin/pint` clean

## Critères d'acceptation

- [ ] Les 6 tables existent avec les colonnes spec, FK et index
- [ ] Les contraintes d'unicité interdisent un second `OwnerProfile` pour le même `(user_id, agency_id)`
- [ ] La FK `users.id` est `restrict on delete` (un user avec profils ne peut pas être hard-deleted)
- [ ] Soft delete fonctionnel sur les 4 tables de profils et les 2 pivots
- [ ] `migrate:rollback` passe proprement (down() symétrique)
- [ ] Aucun changement sur la table `users` (legacy intact)
- [ ] Les tests backend existants restent verts

## Hors périmètre

- Modèles Eloquent et relations (TCK-140)
- Backfill de données depuis `users.type` (TCK-140)
- Suppression de `users.type` / `users.agency_id` (TCK-142)
- Endpoints API (TCK-141)

## Notes d'implémentation

- **6 migrations livrées** sous timestamps `2026_05_02_000001..000006` — strictement schéma, aucun modèle Eloquent (réservé TCK-140).
- **Test schémas via `DB::table` (pas Eloquent)**: `Tests\Feature\Database\ProfileSchemaTest` (12 cas) utilise `DB::table()->insert` directement pour valider unicités/FK/cascade sans modèles, conforme au périmètre.
- **Index secondaires**: `(agency_id, status)` sur tables avec `agency_id` direct (Owner/Agent + 2 pivots) ; `deleted_at` partout pour préserver la perf des scopes `withTrashed`.
- **Index FK custom**: `unique` composé sur pivots renommé (`broker_agency_collab_unique`, `sp_agency_collab_unique`) pour rester sous la limite identifiant SQL.
- **`commission_rate`**: decimal(5,2), aligné avec la convention déjà utilisée sur `agencies.commission_rate`.
- **Sanity migrate:fresh+seed**: vert (1m32s) ; full test suite : 1508/1508 verts ; pint propre.
