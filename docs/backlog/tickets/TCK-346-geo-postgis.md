---
id: TCK-346
title: "Recherche géographique : rayon, distance, carte — avec ou sans PostGIS"
status: todo
phase: P3
family: applicatif
estimate: L
wave: 44
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md
tags: [back, front, geo]
---

## Contexte

**Il n'y a rien à migrer : la géo n'existe pas encore.** Mesuré le 2026-08-21 sur les ~62 000
lignes de `app/` : `addresses.latitude` / `longitude` en `decimal(10,7)`, et **zéro** calcul de
distance, **zéro** `ST_*`, **zéro** filtre par rayon.

C'est une fonctionnalité neuve, pas une conséquence de la migration — d'où son report par
ADR-0020.

## ⚠ PostGIS n'est pas acquis, et c'est le premier arbitrage

Trois chemins, et le plus lourd n'est pas forcément le bon :

| | Coût | Ce que ça donne |
|---|---|---|
| **`_geoRadius` de Meilisearch** | quasi nul — le moteur est déjà là, les 7 modèles déjà indexés | rayon et tri par distance sur la recherche publique |
| **`earthdistance` / formule haversine** en SQL | une extension légère, ou aucune | distance et rayon, sans typage géométrique |
| **PostGIS** | une extension lourde, un type de colonne, une remigration des adresses | polygones, quartiers, intersections, projections |

**Ne pas choisir PostGIS par défaut.** La question à se poser d'abord : le produit a-t-il besoin de
GÉOMÉTRIES (dessiner un quartier, chercher dans un polygone) ou seulement de DISTANCES (« à moins
de 3 km ») ? Le second cas ne justifie pas PostGIS, et l'image du dépôt ne le porte pas
(`pgvector/pgvector:pg17`) : l'adopter changerait l'image de tous les environnements.

## Références

- [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) §2 — pourquoi c'est reporté
