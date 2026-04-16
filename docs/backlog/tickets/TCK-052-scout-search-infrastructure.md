---
id: TCK-052
title: "Laravel Scout + Search Infrastructure"
status: todo
phase: P0
family: back
estimate: S
created: 2026-04-16
updated: 2026-04-16
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

- [ ] `composer require laravel/scout` (+ meilisearch driver si applicable)
- [ ] Config `scout.php` avec index settings
- [ ] `Searchable` trait sur Property avec `toSearchableArray()`
- [ ] Command `scout:import` pour index initial
- [ ] Integration avec `BaseModelTrait` pour post-filtering
- [ ] Tests : `ScoutSearchTest`, `PropertyIndexTest`

## Critères d'acceptation

- [ ] La recherche plein-texte retourne des résultats pertinents sur Property
- [ ] Les résultats sont paginables
- [ ] L'index se met à jour sur save/delete
- [ ] Les données sensibles ne sont pas dans l'index

## Hors périmètre

- Endpoints de recherche publique (→ TCK-024)
- Recherche sémantique (→ P3)
- Autocomplétion (→ P2)
