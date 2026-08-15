---
id: TCK-024
title: Recherche & filtres
status: done
phase: P0
family: applicatif
estimate: M
wave: 23
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-034, TCK-052]
blocks: [TCK-038, TCK-039, TCK-046]
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#23-savedsearch-
tags: [back, front, search, filters, scout, pagination]
---

## Contexte

Laravel Scout est déjà configuré sur le modèle `Property`. Le trait `BaseModelTrait` fournit `filterThroughRequest()` et `orderThroughRequest()`. Ce ticket consolide l'infrastructure de recherche et filtrage transversale utilisée par la découverte publique et les dashboards.

## Objectif

Implémenter la recherche plein-texte via Scout, les filtres dynamiques, la pagination standardisée, le tri dynamique et les recherches sauvegardées.

## Delta à produire

### P0 — MVP bloquant

- [ ] Configuration Scout : driver (Meilisearch ou database), index `properties`
- [ ] Endpoint `GET /api/properties/search?q=` — recherche plein-texte sur biens
- [ ] Filtres dynamiques via query params : `?type=`, `?city=`, `?price_min=..price_max=`, `?bedrooms=`, `?contract_type=`
- [ ] Pagination standardisée (`paginatedThroughRequest()`) sur tous les endpoints de liste
- [ ] Tests : `PropertySearchTest`, `PropertyFilterTest`, `PaginationTest`

### P1

- [ ] Tri dynamique sur toutes les colonnes listables (`?order_by=price:asc`)
- [ ] Migration `saved_searches` : `user_id`, `name`, `filters` (JSON), `notify`, `last_run_at`
- [ ] Endpoints CRUD : `GET/POST /api/saved-searches`, `DELETE /api/saved-searches/{id}`
- [ ] Tests : `DynamicSortTest`, `SavedSearchCrudTest`

### P2

- [ ] Recherche full-text sur messages et documents (extension Scout ou recherche SQL)
- [ ] Suggestions d'autocomplétion sur la recherche de biens

### P3

- [ ] Recherche sémantique par embeddings (→ P3 futur)

## Critères d'acceptation

- [ ] La recherche plein-texte retourne des biens pertinents en < 500ms
- [ ] Les filtres combinés fonctionnent (type + ville + fourchette de prix)
- [ ] La pagination inclut `total`, `per_page`, `current_page`, `last_page`
- [ ] Les recherches sauvegardées sont persistées et récupérables par utilisateur

## Hors périmètre

- Recherche vocale / langage naturel (→ P3 futur)
- Recherche sémantique par embeddings (→ P3 futur)
- UI de recherche publique (→ TCK-039)

## Notes d'implémentation

_(à remplir par implementing-specs)_
