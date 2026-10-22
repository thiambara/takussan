---
id: TCK-1276
title: "La grille de recherche révèle ses six premières cartes au rendu serveur, sans précharger plus de quatre images"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-102--cartes-de-bien-masquées-au-rendu-serveur-hors-de-la-grille-de-recherche"
tags: [front, search, performance, pistes]
---

## Contexte

Réf : **P102.02** du fichier de pistes, `validé`. Entrée dans le lot de l'angle 146 par
complément du même côté (front).

`CARTES_PRIORITAIRES = 4` (`PropertiesDiscoveryPage.tsx`), et `priority` commande dans
`PropertyCard` deux effets : la carte sort visible du rendu serveur (sinon `opacity-0` jusqu'à
l'hydratation), et son image est préchargée. La grille passe à cinq colonnes à 1 536 px et six à
1 800 px : la 5ᵉ et la 6ᵉ carte de la première rangée sortent masquées.

## Décision du porteur

> (c) : séparer les deux effets de `priority` dans `PropertyCard` : un budget de révélation de 6 cartes, qui ne fait que sauter l'état `opacity-0`, et le budget d'images préchargées laissé à 4 ; garde : `PropertiesDiscoveryPage.grille.test.tsx` étendu aux six cartes révélées et aux quatre images prioritaires (porteur, 2026-10-22)

## Objectif utilisateur

Sur un grand écran, toute la première rangée de résultats s'affiche dès le premier rendu.

## Contrat de données

Aucun.

## Delta à produire

- [x] `PropertyCard` : prop `revelee`, qui saute l'état masqué sans toucher au `priority` de l'image.
- [x] `PropertiesDiscoveryPage` : budget de révélation `CARTES_REVELEES = 6`, consommé par les
  emplacements puis par les biens, comme celui des images (`CARTES_PRIORITAIRES = 4`, inchangé).
- [x] `EmplacementsSponsorises` : `revelees`, à côté de `prioritaires`.
- [x] `PropertiesDiscoveryPage.grille.test.tsx` étendu ; `PropertyCard.revelee.tck-1276.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Sans emplacement, les six premiers biens sont révélés et les quatre premiers seuls ont
  leur image prioritaire.
- [x] AC2 — Avec deux emplacements, les deux budgets se comptent depuis la tête de grille.
- [x] AC3 — Une carte `revelee` sans `priority` sort sans `opacity-0`, image non préchargée.

## Hors périmètre

- L'apparition en CSS seul (reste de P69.01), l'autre option de la Piste.

## Notes d'implémentation

- Ablation : `PropertyCard.tsx`, `PropertiesDiscoveryPage.tsx` et `EmplacementSponsorise.tsx`
  rendus à `HEAD` → 1 rouge (`PropertyCard.revelee…`) et 2 rouges (grille) ; correctif remis →
  3/3 et 12/12 verts, `PropertyCard.{robe,structure,mobile}` et `EmplacementSponsorise.test.tsx`
  verts.
