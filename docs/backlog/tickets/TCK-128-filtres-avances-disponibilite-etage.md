---
id: TCK-128
title: Filtres avancés — Disponibilité et Étage absents sur /properties
status: review
phase: P1
family: bug
estimate: M
created: 2026-04-30
updated: 2026-04-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
tags: [front, back, bug, p1, search, filters, property-detail]
---

## Objectif utilisateur

Un visiteur ou client peut filtrer les biens par disponibilité (disponible immédiatement ou à partir d'une date) et par étage sur la page `/properties`, afin d'affiner sa recherche selon ses contraintes pratiques.

## Contrat de données

**Backend** — vérifier si les filtres sont déjà exposés via Spatie Query Builder dans `PublicPropertyController` :
- `filter[available_from]` ou `filter[status]=available` (disponibilité)
- `filter[floor]` (étage)

Si absents, les ajouter dans `AllowedFilter::exact()` / `AllowedFilter::scope()` sur la query builder config du controller.

**Frontend** — la page `/properties` possède déjà un `FilterSidebar` avec les filtres amenités et meublé. Ajouter les deux nouveaux inputs dans ce composant.

## Direction UX / Artistique

- **Disponibilité** : toggle ou date picker "Disponible dès le…" — cohérent avec les autres inputs du panneau (champs numériques, toggles)
- **Étage** : champ numérique ou select (rez-de-chaussée, 1er, 2ème, 3ème+) — à adapter selon les valeurs disponibles dans les données

## Contraintes strictes (métier)

- Les filtres Disponibilité et Étage sont listés P1 dans §1.2 — ils font partie du périmètre MVP.
- Les paramètres URL doivent être synchronisés avec le `FilterSidebar` (pattern déjà en place pour les autres filtres).
- Si le filtre Étage n'a pas de correspondance dans le modèle `Property`, ne pas l'implémenter côté frontend sans la colonne backend — le ticket doit couvrir les deux couches.

## Delta à produire

- [ ] **Backend** — Vérifier la présence de `floor` et d'un filtre disponibilité dans `Property` model et dans les `AllowedFilter` du controller public
- [ ] **Backend** — Si absent : ajouter `AllowedFilter` pour `floor` et `available_from` (ou scope `available`) dans le controller public properties
- [ ] **Frontend** — Ajouter le champ "Disponibilité" dans `FilterSidebar` avec synchronisation URL (`?filter[available_from]=YYYY-MM-DD` ou `?filter[status]=available`)
- [ ] **Frontend** — Ajouter le champ "Étage" dans `FilterSidebar` avec synchronisation URL (`?filter[floor]=N`)
- [ ] **Frontend** — S'assurer que les deux filtres génèrent des chips "actifs" supprimables (pattern déjà en place)
- [ ] Tests backend : filtre `floor` et `available_from` retournent des résultats cohérents

## Critères d'acceptation

- [ ] Le panneau de filtres de `/properties` affiche un champ "Disponibilité"
- [ ] Le panneau de filtres de `/properties` affiche un champ "Étage"
- [ ] Sélectionner une valeur dans chaque filtre met à jour l'URL et réduit les résultats
- [ ] Les chips de filtre actif apparaissent et sont supprimables pour les deux filtres
- [ ] "Tout effacer" supprime également ces deux filtres
- [ ] Aucune régression sur les filtres existants (type, prix, chambres, surface, amenités, meublé)

## Hors périmètre

- Filtre Disponibilité avec plage de dates complexe (calendrier d'occupation) — simplifié en "disponible à partir de"
- Filtres P2 non listés dans le QA (ex. orientation, vue, diagnostic énergétique)

## Notes d'implémentation

- `available_from` filter logic: `WHERE available_from IS NULL OR available_from <= requested_date` — un bien sans date est considéré toujours disponible.
- Column `floor_number` (not `floor`) — confirmé dans la migration `2026_04_17_160005`.
- Hook `useSearch.ts` et type `SearchFilters` étendus ; `SearchToolbar` FILTER_LABELS mis à jour pour les chips.
- 6 tests backend, tous verts.
