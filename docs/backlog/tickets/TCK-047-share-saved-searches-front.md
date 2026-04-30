---
id: TCK-047
title: "Favoris, carte & partage — Frontend"
status: done
phase: P1
family: front
estimate: M
created: 2026-04-16
updated: 2026-04-23
depends_on: [TCK-054, TCK-056, TCK-057, TCK-046, TCK-024]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
tags: [front, favorites, map, share, search, saved-searches]
---

## Objectif utilisateur

Un visiteur peut explorer les biens sur une carte interactive, un utilisateur connecté peut sauvegarder ses favoris et partager un bien, et gérer ses recherches sauvegardées.

## Contrat de données

### Favoris

- `POST /api/favorites` — corps `{ property_id }` pour ajouter
- `DELETE /api/favorites/{property}` — retirer (ID du bien dans l'URL)
- `GET /api/favorites` — liste paginée

### Carte interactive

- `GET /api/public/properties/map?bounds=sw_lat,sw_lng,ne_lat,ne_lng&type=&contract_type=&price_min=&price_max=` — GeoJSON FeatureCollection
- Feature properties : id, title, price, type, thumbnail

### Recherches sauvegardées

- `GET /api/saved-searches` — liste de l'utilisateur
- `POST /api/saved-searches` — créer `{ name, criteria: Record<string, unknown>, notification_frequency?: 'off'|'daily'|'weekly'|'instant' }`
- `DELETE /api/saved-searches/{id}` — supprimer

> **Note** : le contrat utilise `notification_frequency` (enum 4 valeurs) et non un booléen `notify`. Défaut `off` côté front (silencieux). L'activation réelle des alertes email/push est couverte par TCK-022 P2.

### Partage

- Pas d'endpoint dédié — utilisation du Web Share API navigateur + URL du bien

## Direction UX / Artistique

- **Carte** : plein écran ou split (carte + liste). L'IA choisit la bibliothèque cartographique (Mapbox, Leaflet, Google Maps). Marqueurs clusterisés quand le zoom est large. Popup au clic avec mini PropertyCard.
- **Favoris** : icône cœur sur chaque PropertyCard + fiche bien. Animation subtile à l'ajout. Page "Mes favoris" dans l'espace utilisateur.
- **Partage** : bouton discret sur la fiche bien. Web Share API sur mobile, fallback copier-le-lien sur desktop. Pas de modal complexe.
- **Recherches sauvegardées** : accessible depuis la page résultats. Bouton "Sauvegarder cette recherche" qui nomme et enregistre les filtres actuels. Liste consultable dans l'espace utilisateur.
- **Cohérence** : réutiliser les PropertyCards de TCK-038/039. Même langage visuel que le reste du site.

## Contraintes strictes (métier)

- Les favoris nécessitent une authentification — bouton cœur visible mais redirige vers login si non connecté
- La carte doit charger les marqueurs dynamiquement quand l'utilisateur déplace/zoome (bounds update)
- Les recherches sauvegardées reflètent les filtres actifs de l'URL (query params)
- Le partage doit fonctionner sans JavaScript côté serveur (fallback URL copiable)
- Responsive : carte plein écran sur mobile avec bouton basculer vers liste

## Delta à produire

- [ ] Composant carte interactive sur la page résultats (split ou toggle)
- [ ] Marqueurs clusterisés avec popup PropertyCard
- [ ] Bouton favori (cœur) sur PropertyCard + fiche bien
- [ ] Page "Mes favoris" dans l'espace utilisateur
- [ ] Bouton partage sur la fiche bien (Web Share API + fallback)
- [ ] Bouton "Sauvegarder cette recherche" sur la page résultats
- [ ] Page "Mes recherches sauvegardées" dans l'espace utilisateur
- [ ] Gestion du state auth pour favoris (redirect login si non connecté)

## Critères d'acceptation

- [ ] La carte affiche les biens géolocalisés avec marqueurs clusterisés
- [ ] Déplacer/zoomer la carte recharge les marqueurs dans les nouvelles bounds
- [ ] Un utilisateur connecté peut ajouter/retirer un favori avec feedback visuel
- [ ] Un visiteur non connecté est redirigé vers login en cliquant sur favori
- [ ] La page "Mes favoris" liste les biens sauvegardés
- [ ] Le partage fonctionne sur mobile (Web Share) et desktop (copier lien)
- [ ] Une recherche peut être sauvegardée avec ses filtres et retrouvée
- [ ] Les recherches sauvegardées sont supprimables

## Hors périmètre

- Alertes email sur recherches sauvegardées (→ TCK-022 P2)
- Biens similaires / suggestions personnalisées (→ P2)
- Historique local biens consultés (→ P2)
- Filtres avancés amenités (→ TCK-039 P1)

## Notes d'implémentation (Wave 3)

- **Librairie cartographique** : Leaflet + react-leaflet (déjà installés,
  open source, sans clé API). Le composant
  `src/components/map/PropertyMap.tsx` est chargé via `next/dynamic`
  avec `ssr: false` pour tenir le bundle serveur propre et éviter les
  accès `window` à l'hydratation. Les pins utilisent une icône SVG
  inline pour ne pas dépendre des assets de `leaflet/dist/images` qui
  n'ont pas de loader Next configuré.
- **Clustering** : non implémenté dans ce pass — la route back-end
  `/api/public/properties/map` plafonne déjà à `MAP_MAX_RESULTS` et
  renvoie `meta.truncated` ; l'UI affiche un badge « zoom pour
  affiner » quand la troncature est active. Follow-up possible avec
  `leaflet.markercluster` si l'usage le justifie.
- **Favoris** : nouveau composant canonique
  `components/favorites/FavoriteButton.tsx` connecté directement à
  `POST/DELETE /api/favorites` via les mutations de
  `src/lib/queries/favorites.ts`. Bouton cœur utilisé dans le nouveau
  `PropertyCard` (`components/property/PropertyCard.tsx`). Le hook
  legacy `useFavorite` (app action côté Next) reste en place pour la
  fiche détail ; il contient un bug mineur (utilise un favorite id
  comme URL param de `DELETE` alors que le back-end attend le property
  id) — hors périmètre car le fichier n'est pas dans la surface Wave 3.
- **Divergence de contrat** : le ticket mentionne
  `POST/DELETE /api/properties/{property}/favorite` mais le back-end
  expose `POST /api/favorites { property_id }` et
  `DELETE /api/favorites/{property}`. Frontend suit le back-end.
- **Partage** : `components/share/ShareButton.tsx` — Web Share API
  avec fallback copier-le-lien + feedback visuel (pill « Lien copié »).
  Le dialogue détaillé existant (`PropertyShareDialog`) reste
  accessible sur la fiche détail.
- **Recherches sauvegardées** : dialogue modal depuis le bouton
  `SaveSearchButton` sur `/properties`. Les filtres actifs sont
  sérialisés en `criteria` JSON. Le back-end expose
  `notification_frequency` (`off|daily|weekly|instant`) plutôt que le
  `notify` bool du ticket — on envoie `off` par défaut.
- **Pages dashboard** : `/app/favorites` et `/app/saved-searches`
  + entrées correspondantes dans la `AppSidebar` (éditée de façon
  additive — aucun autre item modifié).
- **Tests ajoutés (18 nouveaux)** : schemas search, query keys/bounds,
  ShareButton (Web Share + fallback clipboard), FavoriteButton (auth
  redirect + localStorage fallback).
