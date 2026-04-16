---
id: TCK-039
title: "Liste résultats de recherche"
status: todo
phase: P0
family: front
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-054, TCK-055, TCK-057, TCK-024]
blocks: []
spec_refs:
  features: [docs/features.md#12-recherche--découverte-publique]
  models: [docs/models-spec.md#3-property]
tags: [front, search, filters, pagination]
---

## Objectif utilisateur

Un visiteur peut rechercher et filtrer les biens pour trouver celui qui correspond à ses critères.

## Contrat de données

- `GET /api/public/properties?search=&city=&type=&min_price=&max_price=&bedrooms=&surface_min=&contract_type=&sort=&page=`
- Réponse paginée standard Laravel
- Chaque résultat inclut : title, price, currency, type, contract_type, bedrooms, bathrooms, area, photos (thumbnail), address (city, neighborhood)

## Direction UX / Artistique

- **Barre de filtres** : sidebar sur desktop, drawer/bottom-sheet sur mobile. Pas de filtre visible qui écrase les résultats.
- **Grille de résultats** : PropertyCards réutilisées depuis TCK-038. L'IA choisit la disposition (2/3 colonnes, liste, etc.).
- **Tri** : sélecteur discret (prix croissant, prix décroissant, récence, pertinence).
- **Pagination** : au choix de l'IA (numérotée, "Load more", scroll infini).
- **Zéro résultat** : message élégant avec suggestion de réinitialiser les filtres.
- **Filtres actifs** : badges/pills au-dessus des résultats montrant les filtres actifs, cliquables pour les retirer.

## Contraintes strictes (métier)

- Les filtres sont des query params passés à l'API — pas de filtrage côté client
- L'URL doit refléter les filtres actifs (partageable, bookmarkable)
- Responsive obligatoire
- Les filtres de base P0 : ville, type de bien, fourchette de prix, nombre de chambres, surface minimum, type de transaction (vente/location)

## Delta à produire

- [ ] Page `/properties` avec barre de filtres
- [ ] Grille de résultats avec PropertyCards
- [ ] Sélecteur de tri
- [ ] Pagination
- [ ] État "aucun résultat"
- [ ] Filtres synchronisés avec l'URL (query params)

## Critères d'acceptation

- [ ] La recherche retourne des résultats filtrés avec pagination
- [ ] L'URL reflète les filtres actifs (partageable)
- [ ] Le tri fonctionne (prix, récence, pertinence)
- [ ] L'état "aucun résultat" s'affiche quand les filtres ne matchent rien
- [ ] Les filtres sont utilisables sur mobile (drawer/bottom-sheet)

### P2

- [ ] Biens similaires / suggestions personnalisées : section « Biens similaires » sur la page résultat, basée sur les critères de recherche en cours (même ville, type, fourchette de prix)
- [ ] Historique local des biens consultés : stockage `localStorage` côté navigateur, section « Récemment consultés »

## Hors périmètre

- Filtres avancés amenités (→ TCK-047)
- Carte interactive (→ TCK-047)
- Favoris (→ TCK-046/047)
- Comparateur de biens (→ P2 futur)
- Recherche vocale (→ P3 futur)
