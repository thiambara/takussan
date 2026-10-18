---
id: TCK-892
title: "Réordonner les photos d'un bien ne change plus leurs URL"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage"
tags: [back, media, cache, pistes]
---

## Contexte

Réf : **P10.09** du fichier de pistes, `retenu · autonome` (A2). `PropertyMediaController::reorder`
écrit `order_column` par `update()`, qui touche `updated_at` ; `version_urls`
(`config/media-library.php`) suffixe chaque URL de `?v=<updated_at>`. Chaque déplacement d'une
photo change donc son URL sans que le fichier change : défaut de cache, et transformations neuves
pour ce qui passe par Cloudflare.

## Objectif utilisateur

Une photo déplacée dans la galerie garde son URL, et reste servie depuis le cache.

## Contrat de données

- Aucun schéma ni endpoint modifiés. `PUT /api/properties/{id}/media/reorder` rend la même réponse ;
  `order_column` est écrit sans toucher `updated_at`.

## Contraintes strictes (métier)

- L'ordre rendu par `GET /api/properties/{id}/media` reste celui demandé.

## Delta à produire

- [ ] `PropertyMediaController::reorder` : `order_column` écrit sans horodatage.
- [ ] Test : `tests/Feature/Api/PropertyMediaTest.php`.

## Critères d'acceptation

- [ ] AC1 — Deux photos téléversées, horloge avancée de 5 min, réordonnées : leurs URL
  (`thumbnail`, `preview`, `full`, `original`) sont inchangées, et l'ordre est le nouveau.

## Hypothèses

- Seul `reorder` écrit `order_column` sur une photo de bien (lu, `grep order_column app`).

## Hors périmètre

- Les autres collections de médias, qui n'ont pas de route de réordonnancement.

## Notes d'implémentation
