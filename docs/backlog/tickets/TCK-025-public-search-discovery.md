---
id: TCK-025
title: Recherche & découverte publique
status: todo
phase: P0
family: applicatif
estimate: L
created: 2026-04-15
updated: 2026-04-16
depends_on: [TCK-019, TCK-024]
blocks: [TCK-001]
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#16-favorite-
    - docs/models-spec.md#23-savedsearch-
tags: [front, back, public, search, homepage, favorites, map]
---

## Contexte

L'expérience de découverte est la vitrine de la plateforme pour les visiteurs anonymes et clients connectés. Les pages Next.js (Homepage, SearchResults, ShowProperty) sont à construire et à connecter aux endpoints API. Ce ticket exploite l'infrastructure de recherche de TCK-024.

## Objectif

Implémenter les pages publiques de découverte : homepage, recherche avec filtres, fiche bien, favoris, carte interactive et partage.

## Delta à produire

### P0 — MVP bloquant

- [ ] Page homepage : biens en vedette (`featured = true`), derniers ajouts (tri `created_at desc`)
- [ ] Page recherche : barre de recherche plein-texte + filtres de base (ville, type, prix, chambres, surface, transaction)
- [ ] Tri des résultats : prix croissant/décroissant, récence, pertinence
- [ ] Page fiche bien publique : galerie photos, détails, bouton "Contacter l'agent" (déclenche la création de conversation via TCK-029 si disponible, sinon simple formulaire mailto de repli)
- [ ] Endpoints publics : `GET /api/public/properties`, `GET /api/public/properties/{id}`
- [ ] Tests : `PublicHomepageTest`, `PublicSearchTest`, `PublicPropertyDetailTest`

### P1

- [ ] Filtres avancés : amenités, disponibilité, étage, meublé
- [ ] Carte interactive (intégration Mapbox ou Leaflet) avec markers par bien
- [ ] Migration `favorites` : `user_id`, `property_id`
- [ ] Endpoints `POST/DELETE /api/favorites/{property}`, `GET /api/favorites` — ajout/retrait/liste
- [ ] Recherches sauvegardées avec alertes email (via `SavedSearch.notify` + job schedulé)
- [ ] Bouton partage (lien direct, réseaux sociaux via Web Share API)
- [ ] Tests : `FavoritesTest`, `MapSearchTest`, `SavedSearchAlertTest`

### P2

- [ ] Comparateur de biens côte à côte (→ TCK-001)
- [ ] Biens similaires / suggestions personnalisées (basé sur type, ville, prix)
- [ ] Historique local des biens consultés (localStorage)

### P3

- [ ] Recherche vocale / en langage naturel (→ TCK-010)

## Critères d'acceptation

- [ ] La homepage affiche les biens en vedette et les derniers ajouts
- [ ] La recherche retourne des résultats filtrés avec pagination
- [ ] La fiche bien affiche la galerie, les détails et le bouton de contact (formulaire mailto si TCK-029 non encore déployé, conversation in-app sinon)
- [ ] Un utilisateur connecté peut ajouter/retirer un bien de ses favoris
- [ ] La carte affiche les biens géolocalisés avec des markers cliquables

## Hors périmètre

- Comparateur côte à côte (→ TCK-001)
- Recherche vocale / NLP (→ TCK-010)
- Recherche sémantique (→ TCK-012)

## Notes d'implémentation

_(à remplir par implementing-specs)_
