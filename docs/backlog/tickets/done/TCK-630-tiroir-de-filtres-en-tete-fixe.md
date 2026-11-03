---
id: TCK-630
title: "Tiroir des filtres sur téléphone : l'en-tête (« Filtres », « Tout effacer », fermer) défilait avec les filtres ; il reste en haut, le corps défile dessous"
status: done
phase: P1
family: front
estimate: S
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, public, recherche, filtres, mobile, ux]
---

## Objectif utilisateur

- **Le visiteur sur téléphone** garde « Tout effacer » et la croix de fermeture sous le pouce
  pendant qu'il parcourt les filtres de `/properties`.

## Contexte

Retour du porteur, capture à 429 px sur preview (2026-10-10) : l'en-tête du tiroir était DANS la
zone qui défile (`TiroirMobile`, `overflow-y-auto`), et il sortait de l'écran dès la première
section.

## Décision

`FilterSidebar` rend l'en-tête à part du corps (`entete`, `rendreCorps`).

- Le tiroir pose l'en-tête au-dessus de sa zone de défilement (`data-defilement="tiroir"`,
  `min-h-0 flex-1 overflow-y-auto`), et le bouton « Voir N biens » reste dessous.
- La barre latérale du bureau monte les deux l'un après l'autre, comme avant.

## Critères d'acceptation

- [x] Le titre et la fermeture sont hors de la zone qui défile, et les sections dedans
      (`FilterSidebar.tiroir.test.tsx`, rouge sans le correctif).
- [x] Au navigateur, le titre reste à la même hauteur après 600 px de défilement du corps.

## Vérification

- Front local contre l'API de preview, fenêtre de 500 px (le minimum de Chrome) :
  - le titre est à 98 px avant comme après `scrollTop = 600` ;
  - 1348 px de contenu défilent sous lui.
