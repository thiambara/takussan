---
id: TCK-046
title: "Favoris & carte interactive"
status: todo
phase: P1
family: back
estimate: M
created: 2026-04-16
updated: 2026-04-22
depends_on: [TCK-034, TCK-024]
blocks: [TCK-047]
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
tags: [back, favorites, map, geojson, search]
---

## Objectif utilisateur

Un utilisateur connecté peut sauvegarder des biens en favoris et les retrouver, et tout visiteur peut localiser les biens sur une carte interactive.

## Contrat de données

### Favoris

- `POST /api/properties/{property}/favorite` — ajouter aux favoris
- `DELETE /api/properties/{property}/favorite` — retirer des favoris
- `GET /api/favorites` — liste des biens favoris de l'utilisateur courant (paginé)
- Modèle : table pivot `property_user` (user_id, property_id, created_at) ou modèle `Favorite` dédié
- Réponse : Property resource standard (même format que TCK-034)

### Carte interactive

- `GET /api/public/properties/map?bounds=sw_lat,sw_lng,ne_lat,ne_lng&type=&contract_type=&price_min=&price_max=` — retourne GeoJSON FeatureCollection
- Chaque Feature : `{ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { id, title, price, type, thumbnail } }`
- Dépend du champ `address.latitude` / `address.longitude` (TCK-035)

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Un utilisateur ne peut avoir qu'un seul favori par bien (unique constraint sur user_id + property_id)
- Les favoris sont réservés aux utilisateurs authentifiés (Customer, Agent, Owner)
- L'endpoint carte est public (pas d'auth requise)
- L'endpoint carte doit supporter un bounding box obligatoire pour limiter le volume de données
- Les biens sans adresse géolocalisée sont exclus de la carte
- Rate limiting sur l'endpoint carte (public, potentiellement coûteux)

## Delta à produire

- [ ] Migration : `create_favorites_table` (user_id, property_id, timestamps, unique constraint)
- [ ] Modèle : `Favorite` avec belongsTo User/Property
- [ ] Controller : `FavoriteController` (store, destroy, index)
- [ ] Route : `POST/DELETE /api/properties/{property}/favorite`, `GET /api/favorites`
- [ ] Policy : `FavoritePolicy` (seul le propriétaire peut gérer ses favoris)
- [ ] Endpoint carte : `GET /api/public/properties/map` avec param bounds
- [ ] Resource : `PropertyMapGeoJsonResource` retournant GeoJSON
- [ ] Tests : `FavoriteTest` (CRUD + doublon), `PropertyMapTest` (bounds, GeoJSON, exclusion sans coords)

## Critères d'acceptation

- [ ] Un utilisateur authentifié peut ajouter/retirer un bien en favoris
- [ ] Ajouter un favori en double renvoie une erreur 409 ou est idempotent
- [ ] `GET /api/favorites` retourne la liste paginée des biens favoris
- [ ] L'endpoint carte retourne un GeoJSON valide avec seulement les biens dans les bounds
- [ ] Les biens sans coordonnées GPS sont exclus du GeoJSON
- [ ] L'endpoint carte est accessible sans authentification

## Hors périmètre

- Frontend favoris (→ TCK-047)
- Frontend carte interactive (→ TCK-047)
- Alertes email sur favoris (→ TCK-022 notifications P2)
- Recherches sauvegardées (→ TCK-024 P1)
