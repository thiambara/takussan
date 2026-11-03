---
id: TCK-1036
title: "Liste des biens : les emplacements sponsorisés comptent dans les quatre cartes prioritaires"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#sur-la-liste-les-biens-sponsorisés-en-tête-restent-invisibles-jusquà-lhydratation--lcp-à-10-s-pour-des-cartes-présentes-dans-le-html-à-3-s"
tags: [front, performance, recherche, boost, pistes]
---

## Contexte

Réf : **P69.01** du fichier de pistes, `retenu · autonome` (A1 : le comportement attendu est écrit
dans le commentaire de `PropertyCard`, « Priority cards (above-the-fold) skip the initial hidden
state so the browser can count their image as the LCP candidate immediately »).

Sur `/properties`, les emplacements sponsorisés sont rendus en tête de la grille, avant les cartes
ordinaires, mais `EmplacementsSponsorises` monte `PropertyCard` sans `priority`, et la grille
compte `priority={i < 4}` sur les seules cartes ordinaires. Les premières cartes de la page sortent
donc du rendu serveur en `opacity-0`, avec une image `loading="lazy"`, jusqu'à l'hydratation
(LCP médian mesuré par l'explorateur : 10,3 s sous Fast 3G).

## Objectif

Les quatre premières cellules de la grille de la liste, emplacements sponsorisés compris, sont
rendues `priority`.

## Delta à produire

- [x] `EmplacementsSponsorises` : une prop qui dit combien de ses premiers emplacements sont
      prioritaires.
- [x] `PropertiesDiscoveryPage` : un seul budget de quatre cartes prioritaires, consommé d'abord par
      les emplacements rendus, puis par les cartes ordinaires.
- [x] Test de garde dans `PropertiesDiscoveryPage.grille.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Avec deux emplacements sponsorisés et trois biens ordinaires, les deux emplacements et
      les deux premiers biens sont `priority`, le troisième non.
- [x] AC2 — Sans emplacement, les quatre premiers biens ordinaires restent `priority`, comme avant.

## Hors périmètre

- La réécriture de l'apparition en CSS seul, sans état masqué dépendant du JS (« mieux encore » de
  la piste, hors du classement A1).
- Le `loading="lazy"` vu par l'explorateur sur la carte ordinaire d'indice 0 (non reproduit par le
  mesureur sur le composant seul).

## Reste à faire

ne plus masquer les cartes au rendu serveur, en animant leur apparition par CSS seul, sans état initial `opacity-0` dépendant du JS

## Hypothèses

- Quand la liste est en erreur, les emplacements ne sont pas rendus : ils ne consomment alors rien
  du budget.

## Notes d'implémentation

- Ablation (2026-10-20) : `PropertiesDiscoveryPage.tsx` et `EmplacementSponsorise.tsx` rendus à
  `pre-dev` → le test « deux emplacements puis trois biens » rougit (priorités reçues
  `non, non, oui, oui, oui` au lieu de `oui, oui, oui, oui, non`) ; correctif remis → 10/10 verts.
- Le budget de quatre est une constante unique (`CARTES_PRIORITAIRES`) : les emplacements le
  consomment d'abord, les biens ordinaires ont le reste. Avant, le `4` vivait en ligne dans la seule
  grille ordinaire.
