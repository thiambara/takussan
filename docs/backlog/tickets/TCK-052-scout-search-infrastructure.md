---
id: TCK-052
title: "Laravel Scout + Search Infrastructure"
status: done
phase: P0
family: back
estimate: S
created: 2026-04-16
updated: 2026-04-22
depends_on: [TCK-048]
blocks: [TCK-024]
spec_refs:
  features: [docs/features.md#24-recherche--filtres]
  models: [docs/models-spec.md#3-property]
tags: [back, infrastructure, scout, search, meilisearch]
---

## Objectif utilisateur

La recherche plein-texte est opérationnelle et tout modèle searchable peut être indexé et queryé.

## Contrat de données

- Laravel Scout configuré avec driver (Meilisearch recommandé, database fallback)
- Index `properties` sur modèle Property
- `Searchable` trait sur modèles concernés
- Query builder : `toSearchableArray()`, `search()`, `paginateOnSearch()`
- Configuration : `config/scout.php` avec index settings par modèle

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Driver database acceptable pour dev/local, Meilisearch pour production
- Les données sensibles (prix interne, notes agent) ne sont pas indexées
- L'index est synchronisé automatiquement sur save/delete
- Les résultats sont filtrables après recherche (post-filter via query scope)

## Delta à produire

- [x] `composer require laravel/scout` (+ meilisearch driver si applicable) — `laravel/scout ^11.1` déjà présent dans `composer.json`. Driver Meilisearch inclus dans le package ; credentials à fournir via env en prod.
- [x] Config `scout.php` avec index settings — `config/scout.php` publié, driver par défaut `collection` (pilotable via `SCOUT_DRIVER`).
- [x] `Searchable` trait sur Property avec `toSearchableArray()` — wiring déjà en place ; payload réduit à `id, title, description, type, contract_type, rent_period, status, city` ; `shouldBeSearchable()` garde les drafts et les visibilités non-publiques hors de l'index.
- [x] Command `scout:import` pour index initial — fournie par le package Scout (`php artisan scout:import "App\Models\Property"`).
- [x] Integration avec `BaseModelTrait` pour post-filtering — `scopeWithSearch(?string $term)` + helper `isSearchable()` ajoutés ; utilisation typique `Property::query()->withSearch($q)->public()->paginate()`.
- [x] Tests : `ScoutSearchTest`, `PropertyIndexTest` — ajoutés sous `tests/Feature/Search/`. Driver `collection` figé dans `phpunit.xml` pour éviter toute dépendance externe en CI.

## Critères d'acceptation

- [x] La recherche plein-texte retourne des résultats pertinents sur Property
- [x] Les résultats sont paginables
- [x] L'index se met à jour sur save/delete
- [x] Les données sensibles ne sont pas dans l'index

## Notes d'implémentation

**Driver & environnements.** Le driver par défaut est `collection` (in-memory, aucune dépendance externe). `SCOUT_DRIVER=collection` est figé dans `phpunit.xml` pour que la CI reste hermétique. Pour la prod, basculer vers `meilisearch` en définissant `SCOUT_DRIVER`, `MEILISEARCH_HOST` et `MEILISEARCH_KEY` dans `.env` et lancer `php artisan scout:import "App\Models\Property"` au déploiement.

**Exclusion des champs sensibles.** `Property::toSearchableArray()` ne projette que les champs publics (`id, title, description, type, contract_type, rent_period, status, city`). `price`, `user_id`, `agency_id`, `metadata` et tout futur champ interne (notes agent, prix interne…) sont structurellement absents du payload — une assertion dédiée dans `ScoutSearchTest::test_searchable_array_excludes_sensitive_fields` fige cette contrainte.

**Synchronisation de l'index.** `shouldBeSearchable()` exclut les propriétés `Draft` ou de visibilité non-publique ; l'observateur Scout sync automatiquement sur `save`/`delete` (voir `PropertyIndexTest`). Une propriété devient indexable dès qu'elle passe `Available` + `Public`.

**Composition Scout + QueryBuilder.** `scopeWithSearch(?string $term)` sur `BaseModelTrait` exécute la recherche Scout et restreint le Builder Eloquent via `whereIn(pk, $ids)`. Cela permet de chaîner Scout avec `public()`, les filtres spatie (`QueryBuilder::for(...)`), les joins, le tri et la pagination standard — pattern canonique pour TCK-024 :

```php
$q = $request->input('q');
return Property::buildQuery(Property::query()->withSearch($q)->public(), $request)
    ->paginate();
```

Quand `$term` est vide/null ou que le modèle ne tire pas `Searchable`, le scope est un no-op — chaîner inconditionnellement est sûr.

## Hors périmètre

- Endpoints de recherche publique (→ TCK-024)
- Recherche sémantique (→ P3)
- Autocomplétion (→ P2)
