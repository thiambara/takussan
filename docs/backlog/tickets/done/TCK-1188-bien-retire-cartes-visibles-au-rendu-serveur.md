---
id: TCK-1188
title: "Bien retiré : les cartes similaires de la première rangée sortent visibles du rendu serveur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-page-dun-bien-loué-vendu-ou-retiré-sort-du-rendu-serveur-avec-toutes-ses-cartes-similaires-en-opacity-0-visibles-seulement-après-lhydratation"
tags: [front, performance, public, pistes]
---

## Contexte

Réf : **P102.01** du fichier de pistes, `retenu · autonome` (A1 : le contrat est écrit dans
`PropertyCard`, « Priority cards (above-the-fold) skip the initial hidden state so the browser can
count their image as the LCP candidate immediately », et appliqué par `PublicFavoritesPage` et
TCK-1036).

`bienRetire()` rend les biens similaires, servis par le serveur, en `PropertyCard` sans `priority` :
toutes les racines de carte sortent du rendu serveur en `opacity-0`, avec une image
`loading="lazy"`, jusqu'à l'hydratation. Le lecteur d'un lien de bien loué voit un titre, un
bouton et un vide.

## Objectif

Les cartes de la première rangée de la grille des similaires (trois, le nombre de colonnes au plus
large) sont `priority`.

## Delta à produire

- [x] `bien-retire.tsx` : `priority={index < 3}` sur les cartes similaires.
- [x] Test de garde en rendu serveur, avec la vraie carte :
      `__tests__/bien-retire.rendu-serveur.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Avec quatre similaires, les trois premières racines de carte du HTML servi ne portent
      pas `opacity-0`, la quatrième si.
- [x] AC2 — Les images des trois premières cartes ne sont pas `loading="lazy"`.

## Hors périmètre

- L'apparition des cartes en CSS seul, sans état masqué dépendant du JS : reste de P69.01.
- Le `sizes` des cartes de cette page : P102.03, ticket à part.

## Hypothèses

- La première rangée est au-dessus du pli au moins à partir de `lg` : déduit des classes, pas
  mesuré au navigateur (mesure du mesureur). Trois cartes est le nombre de colonnes au plus large,
  sur le patron de `PublicFavoritesPage` (`priority={i < 3}`).

## Notes d'implémentation

- Ablation (2026-10-22) : `bien-retire.tsx` rendu à `pre-dev` → les deux tests rougissent
  (racines masquées `true, true, true` au lieu de `false, false, false` ; images `lazy`) ;
  correctif remis → 2/2 verts.
- `page.server.test.tsx` remplace `PropertyCard` par un `<article>` : il ne pouvait pas voir ce
  défaut, d'où un fichier à part qui monte la vraie carte sous `renderToString`.
