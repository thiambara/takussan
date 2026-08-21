---
id: TCK-340
title: "Onze listes de clés de filtre côté front, une seule source"
status: todo
phase: P3
family: technique
estimate: L
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: [TCK-335]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [front, search, dette, refactor]
---

## Objectif utilisateur

Ajouter un filtre sans libellé devient une erreur de compilation, pas une puce muette.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md), qui a posé la garde de parité
**front↔back** (`src/types/__tests__/search-filters.parity.test.ts`) mais laissé les listes
**front↔front**. Inventaire mesuré le 2026-08-21 : **onze listes**, plus trois dictionnaires.

`SearchFilters` (`types/search.ts`) · `filtersToParams` et `filtersFromSearchParams`
(`useSearch.ts`, deux listes **distinctes**) · `IGNORED_KEYS` · `FILTER_LABELS` et
`HIDDEN_FROM_TAGS` (`SearchToolbar.tsx`) · les contrôles de `FilterSidebar` · `mapFilters`
(`PropertiesDiscoveryPage.tsx`) · `criteriaToQueryString`/`humaniseCriteria`
(`SavedSearchesList.tsx`) · `filtersToCriteria`/`suggestName` (`SaveSearchButton.tsx`, **quatrième**
définition des clés ignorées) · `UsePropertiesParams` (`useProperties.ts`).

Une douzième — `searchFiltersSchema` — **avait déjà divergé** (18 clés contre 20) et a été
supprimée par TCK-335 : elle n'avait aucun consommateur de production, donc rien ne pouvait le dire.

## Contraintes strictes (métier)

- Aucun de ces quatre fichiers n'a de test aujourd'hui. Le refactor doit **commencer** par les
  poser, sinon il est invérifiable.
- La moitié front↔back **ne peut pas** être rendue impossible (deux runtimes) : elle reste gardée
  par la parité de TCK-335. Ce ticket ne traite que la moitié front.

## Delta à produire

- [ ] Une table `SEARCH_FILTER_KEYS` unique portant, par clé : le codec URL, son statut de
      pagination, sa fabrique de libellé
- [ ] `SearchFilters` en dérive par `typeof` ; les cinq listes de `useSearch`/`SearchToolbar` aussi
- [ ] Tests sur les quatre fichiers, écrits **avant** le déplacement

## Critères d'acceptation

- [ ] AC1 — ajouter une clé sans libellé fait échouer `tsc --noEmit`
- [ ] AC2 — aucune liste de clés de filtre n'est écrite deux fois côté front

## Hors périmètre

- La parité front↔back, déjà gardée.

## Notes d'implémentation

_(à remplir par implementing-specs)_
