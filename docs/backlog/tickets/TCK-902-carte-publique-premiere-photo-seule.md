---
id: TCK-902
title: "Carte publique : seule la première photo de chaque bien est chargée, plus tous ses médias"
status: done
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
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-1--recherche-dun-bien"
tags: [back, performance, media, pistes]
---

## Contexte

Réf : **P01.10** du fichier de pistes, `retenu · autonome` (A2).

`GET /api/public/properties/map` rend jusqu'à 501 biens. `PropertyMapGeoJsonResource` ne lit que
`getFirstMedia('photos')` pour la vignette, mais le contrôleur chargeait `with('media')` : toutes
les photos de chaque bien, et les médias de ses autres collections.

## Objectif utilisateur

Aucun changement visible : la même vignette, pour un chargement borné à un média par bien.

## Contraintes strictes

- La vignette reste la première photo dans l'ordre de la galerie (`order_column`), comme
  `getFirstMedia('photos')` la choisit sur la relation entière.
- Aucun changement du périmètre ni du compte des biens rendus.

## Delta à produire

- [x] `PublicPropertyController::map()` : `media` chargé sous contrainte (`collection_name =
      'photos'`, tri `order_column` puis `id`, `limit(1)`, limite par parent d'Eloquent).
- [x] `tests/Feature/Public/PropertyMapPhotoLoadTest.php`.

## Critères d'acceptation

- [x] AC1 — Deux biens à trois photos : 2 médias hydratés, et non 6.
- [x] AC2 — Quand la troisième photo téléversée est mise en tête de galerie, c'est elle que la
      vignette rend.

## Hors périmètre

- L'index `(latitude, longitude)` sur `addresses` : le mesureur ne l'a pas retenu, aucune lenteur
  mesurée (842 biens en dev). Il reste dans l'entrée.

## Notes d'implémentation

- **Mesure avant** : 6 médias hydratés pour 2 biens à trois photos.
- **Ablation** : correctif retiré → 6 au lieu de 2, rouge ; variante sans le tri `order_column`
  (tri par `id` seul) → la vignette n'est plus la première de la galerie, rouge ; remis → vert.
- Piège : la première version de l'assertion cherchait le nom de fichier `c` dans l'URL, toujours
  vrai ; la variante d'ablation est restée verte. Noms de fichiers rendus distincts
  (`photo-gamma`), la variante rougit.
- `PropertyMapTest`, `PropertyMapRadiusTest` et les autres tests qui appellent la carte : 107 verts.
