---
id: TCK-074
title: "Property — Dupliquer + archivage en lot"
status: review
phase: P2
family: back
estimate: S
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-034, TCK-035, TCK-036]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [property, duplicate, bulk, back]
---

## Contexte

TCK-034/035/036 (property CRUD complet) sont `done`/`review`. La spec §1.1 P2 liste deux actions manquantes :

- « Dupliquer un bien (modèle / template) »
- « Archivage en lot »

Aucun endpoint n'expose ces opérations aujourd'hui. Ces actions sont des gains de productivité forts pour les agents gérant des portefeuilles (immeubles avec lots quasi identiques, clôture de saison).

## Objectif

Exposer deux endpoints backend permettant respectivement de dupliquer un bien (avec ou sans médias) et d'archiver en lot une sélection de biens.

## Contrat de données

### Endpoints à créer

- `POST /api/properties/{property}/duplicate` — body `{ copy_media?: boolean = false, title_suffix?: string = " (copie)" }` → crée une nouvelle Property avec les mêmes champs (sauf `reference`, `slug`, `published_at`, `status` qui repassent à `draft`), copie optionnelle des médias (collection `photos`), retourne la nouvelle Property.
- `POST /api/properties/bulk-archive` — body `{ property_ids: [id, id, ...], reason?: string }` → archive les biens sélectionnés (`status=archived`, `archived_at=now()`), retourne `{ archived: n, failed: [{id, reason}] }`.

### Policy

- `PropertyPolicy::duplicate($user, $property)` — utilisateur doit avoir `update` sur le bien source.
- `PropertyPolicy::bulkArchive($user)` — utilisateur doit avoir `update` sur tous les biens listés (sinon l'échec est reporté par id).

## Contraintes strictes (métier)

- La duplication ne copie pas : `reference` (régénérée), `slug` (régénéré), `published_at` (null), `status` (→ `draft`), compteurs `views_count`/`favorites_count` (→ 0), historique prix, réservations, baux.
- La duplication copie : toutes les caractéristiques, tags, amenités, adresse (nouvelle instance), collaborateurs (si `copy_collaborators=true` — param optionnel).
- Les médias ne sont copiés que si `copy_media=true` — copie effective via `copy()` de `spatie/laravel-medialibrary` (pas de lien partagé).
- `bulk-archive` doit être transactionnel : soit tous les biens autorisés sont archivés, soit l'endpoint retourne la liste des échecs sans appliquer.
- Le journal d'activité (TCK-018) log chaque bien dupliqué ou archivé.

## Delta à produire

- [ ] `PropertyController@duplicate` + route `POST /properties/{property}/duplicate`
- [ ] `PropertyController@bulkArchive` + route `POST /properties/bulk-archive`
- [ ] Service `App\Services\Property\PropertyDuplicationService` (encapsule la logique)
- [ ] Service `App\Services\Property\PropertyBulkArchiveService`
- [ ] FormRequest `PropertyDuplicateRequest` + `PropertyBulkArchiveRequest`
- [ ] Policy methods `duplicate` + `bulkArchive`
- [ ] Tests Feature :
  - `PropertyDuplicationTest::test_duplicate_creates_draft_with_new_reference`
  - `PropertyDuplicationTest::test_duplicate_copies_media_when_requested`
  - `PropertyDuplicationTest::test_duplicate_does_not_copy_bookings_or_price_history`
  - `PropertyBulkArchiveTest::test_archives_authorized_properties`
  - `PropertyBulkArchiveTest::test_reports_unauthorized_in_failed_list`
  - `PropertyBulkArchiveTest::test_transactional_on_failure`

## Critères d'acceptation

- [ ] AC1 — `POST /properties/{id}/duplicate` retourne 201 avec une nouvelle Property en `draft`, référence différente, slug différent
- [ ] AC2 — Avec `copy_media=true`, les photos sont effectivement dupliquées (nouveau `Media::id`, fichiers physiques indépendants)
- [ ] AC3 — `POST /properties/bulk-archive` avec 5 ids dont 1 non autorisé archive les 4 autorisés + retourne l'échec pour le 5e
- [ ] AC4 — Un utilisateur sans droit `update` sur le bien source reçoit 403
- [ ] AC5 — Le journal d'activité contient une entrée `property.duplicated` et `property.archived_bulk` par action
- [ ] AC6 — `php artisan test --filter=PropertyDuplicationTest --filter=PropertyBulkArchiveTest` vert
- [ ] AC7 — Pint clean

## Hors périmètre

- UI frontend pour ces actions — peut être ajoutée au dashboard agent (TCK-041) via bouton "Dupliquer" et sélection multiple, mais pas bloquant ici
- Template / modèle prédéfini (créer un bien depuis un template nommé) — P3
- Restauration en masse (unarchive bulk) — P3 symétrique

## Notes d'implémentation

- Implémenté via `PropertyDuplicationService` + `PropertyBulkArchiveService` sous `App\Services\Property\`.
- Duplication : `Property::replicate()` avec liste d'exclusion (`reference_number`, `slug`, compteurs, `published_at`, `archived_at`, `deleted_at`). Le boot hook `Property::booted()` régénère `reference_number` + `slug`. La copie des médias passe par `spatie/laravel-medialibrary::copy()` **hors transaction** — éviter que les écritures disque soient rollback par une erreur DB indépendante.
- Bulk archive : passe en `status=archived` + `visibility=private` + `archived_at=now()` ; rapport per-id (`not_found`, `forbidden`, `already_archived`). Transactionnel : toute exception annule l'intégralité du batch.
- `PropertyPolicy` (nouveau) expose `duplicate` + `bulkArchive` ; déclaré explicitement dans `AppServiceProvider::boot` via `Gate::policy(Property::class, PropertyPolicy::class)` car `Property` est déjà mappé par un comportement custom et l'auto-découverte de Laravel ne le détecterait pas de façon déterministe.
- Migration ajoute `archived_at` (timestamp nullable indexé) — séparé de `deleted_at` pour que l'archivage reste un statut logique et non une suppression douce.
- Routes : `properties/bulk-archive` déclarée **avant** `properties/{property}/*` pour éviter la collision avec `{property}`.
- 14 tests Feature, filtre `php artisan test --filter=PropertyDuplicationTest --filter=PropertyBulkArchiveTest` → vert. Pint clean.
- PR : https://github.com/thiambara/takussan/pull/&lt;REMPLIR_APRES_CREATION&gt;
