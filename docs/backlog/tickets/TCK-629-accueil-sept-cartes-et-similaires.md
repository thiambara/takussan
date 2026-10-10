---
id: TCK-629
title: "Accueil, retour du porteur sur TCK-628 : sept cartes par rangée dès un écran d'ordinateur, plus de tuiles par ville, type ou quartier, et « Récemment consultés » complété par des biens similaires"
status: done
phase: P1
family: front
estimate: S
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-628]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, public, accueil, carte-de-bien, ux]
---

## Objectif utilisateur

- **Le visiteur de l'accueil** voit sept annonces par rangée sur un écran d'ordinateur ordinaire,
  comme sur Airbnb, dans toutes les rangées.
- **Le visiteur qui a consulté peu de biens** voit tout de même une rangée pleine sous
  « Récemment consultés » : ses biens d'abord, puis des biens qui leur ressemblent.

## Contexte

Retour du porteur sur TCK-628, capture d'Airbnb à l'appui (2026-10-10) :

- **Sept cartes seulement à 1920 px** : TCK-628 n'en posait sept qu'à partir de 1680 px de
  contenu. Un portable de 1280 à 1440 px en montrait cinq.
- **Trois sections jugées moins belles** que des rangées de cartes : les tuiles « Par ville », les
  tuiles « Par type de bien » et les pastilles « Quartiers prisés ».
- **« Pour vous · Récemment consultés »** : avec deux biens consultés, la rangée se réduisait à deux
  cartes à gauche d'un écran vide.

## Décisions

1. **Paliers resserrés** dans `PropertyRow` : 4 colonnes dès 768 px de contenu, 5 dès 960, 6 dès
   1088, 7 dès 1216 (7 dès 1264 px d'écran).
   - Une carte mesure 160 px au plus étroit de sept, 254 px à 1920 px.
   - `CARD_SIZES_RANGEE` suit, sous la garde de `card-image-sizes.test.ts`.
2. **« À louer » passe en carte Standard.** La carte horizontale (deux par ligne au plus) ne peut pas
   en ranger sept. Toutes les rangées de l'accueil défilent désormais sur la même géométrie.
3. **Les tuiles et les pastilles sont retirées**, ainsi que `home/RaccourcisDeLAccueil.tsx` et les
   clés `homepage.explore`. `raccourcisDeLAccueil` ne lit plus que la rangée « À vendre ».
4. **La ligne de détails des cartes de rangée tient sur une ligne** (`CardMeta uneLigne`), tronquée
   par « … » avec le texte entier en `title`.
   - Sans ça, à 160 px, la ligne passait à la ligne sur une carte sur deux, et les prix ne
     s'alignaient plus d'une carte à l'autre.
5. **« Récemment consultés » est complété sur l'accueil** (`useSimilairesDesVus`) jusqu'à
   `CIBLE_DE_LA_RANGEE` (12) cartes :
   - les biens consultés d'abord, dans leur ordre ;
   - puis les similaires des trois biens consultés les plus récents, lus sur l'endpoint existant
     `GET /public/properties/{slug}/similar` ;
   - les sources sont prises à tour de rôle, sans doublon ;
   - une source en panne tombe seule.

   Quand des similaires sont présents, le titre devient « Selon vos intérêts · Récemment consultés et
   biens similaires ». La fiche d'un bien ne complète pas, car elle a déjà sa section « Biens
   similaires ».

## Critères d'acceptation

- [x] **AC1** — Rangées de l'accueil : 7 cartes entières à 1280, 1440 et 1920 px, 5 à 1024 px,
      2 cartes plus un bout à 390 px, sans défilement horizontal de la page.
- [x] **AC2** — Aucune tuile par ville, par type ou par quartier sur l'accueil, et aucune de leurs
      requêtes.
- [x] **AC3** — « À louer » est une rangée de cartes Standard.
- [x] **AC4** — Deux biens consultés, puis des similaires à leur suite, sans doublon. Le titre ne
      promet des similaires que lorsqu'il y en a.
- [x] **AC5** — Les prix des cartes d'une même rangée sont alignés.
- [x] **AC6** — Toute nouvelle chaîne visible existe en fr, en et wo.

## Suivi hors code

- Le wolof de `recentlyViewed.withSimilar` (« Li nga bëgg », « Xooloon ci kanam ak yu ko niru »)
  doit être relu par une personne qui le parle.

## Vérification

- **Navigateur** (2026-10-10) : front local (`next dev`) contre l'API de preview, avec de vraies
  photos.
  - Rangée « À vendre », rendue par le serveur : 7 cartes entières à 1280 (162 px), 1440 (185 px) et
    1920 px (254 px), 5 à 1024 px, 2 à 390 px. `scrollWidth == innerWidth` à chaque largeur.
  - Les sept prix sont à la même hauteur.
  - Les autres rangées ne se mesurent pas ainsi en local : l'API de preview n'autorise que
    l'origine `preview.takussan.com` (CORS). Elles partagent la même disposition (`rangee`).
- **Tests** :
  - `similaires-des-vus.test.ts` et `useSimilairesDesVus.test.ts` : fusion, limite, panne, aucune
    requête quand la rangée est pleine ;
  - `RecentlyViewedCarousel.test.tsx`, `HomepageDiscovery.test.tsx`, `CardMeta.test.tsx`,
    `card-image-sizes.test.ts` et `raccourcis-de-l-accueil.test.ts` ;
  - le branchement des similaires sur l'accueil rougit quand on le retire (ablation).
- **Garde de contraste** : le cliquet passe de 258 à 256, les deux entrées du composant supprimé.
