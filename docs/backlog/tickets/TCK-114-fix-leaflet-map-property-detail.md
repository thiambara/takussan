---
id: TCK-114
title: Fix carte Leaflet vide sur la fiche bien
status: todo
phase: P0
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#4-address
tags: [front, bug, p0, leaflet, map]
---

## Objectif utilisateur

Le visiteur peut voir la carte de localisation du bien sur la fiche `/properties/[slug]`.

## Contrat de données

Les coordonnées GPS du bien sont déjà disponibles dans la réponse API (`address.lat`, `address.lng`). Aucun changement backend.

## Direction UX / Artistique

La carte doit correspondre au style déjà utilisé sur `/properties` (OpenStreetMap / Leaflet). Centrage sur les coordonnées du bien, marqueur unique, même hauteur de conteneur.

## Contraintes strictes (métier)

Leaflet ne fonctionne pas côté serveur (SSR) — le composant carte doit être importé avec `dynamic(() => …, { ssr: false })`.

## Delta à produire

- [ ] Localiser le composant carte de la fiche bien (probablement `src/components/property/PropertyMap.tsx` ou similaire)
- [ ] S'assurer que l'import Leaflet est dynamique (`next/dynamic` avec `ssr: false`) — même pattern que sur la page de recherche
- [ ] Vérifier que les coordonnées de l'adresse (`lat`, `lng`) sont bien passées en props
- [ ] Vérifier l'affichage sur une fiche bien en local (carte centrée + marqueur visible)

## Critères d'acceptation

- [ ] La carte Leaflet s'affiche correctement sur `/properties/[slug]` avec les coordonnées du bien
- [ ] Aucun écran gris ou erreur de rendu liée à Leaflet
- [ ] La carte se charge sans erreur en navigation SSR (premier chargement) comme CSR (navigation interne)
- [ ] Aucune régression sur la carte de la page de recherche `/properties`

## Hors périmètre

- Vue satellite ou autres fournisseurs de tuiles
- Affichage de biens voisins sur la carte de la fiche

## Notes d'implémentation

_(à remplir par implementing-specs)_
