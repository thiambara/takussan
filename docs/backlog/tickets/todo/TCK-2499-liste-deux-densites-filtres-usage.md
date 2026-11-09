---
id: TCK-2499
title: Liste « Deux densités » et feuille de filtres dans l'ordre de l'usage
status: todo
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: [TCK-2498]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#24-recherche--filtres"
  models: []
tags: [front, search, mobile, audit-ux]
---

## Objectif utilisateur

Au téléphone, le chercheur compare quatre à cinq biens par écran au lieu de deux, et pose son budget et ses chambres sans chercher sous seize types de bien.

## Contrat de données

Liste publique existante ; répartition des prix de TCK-2498 pour le budget ; sponsorisés selon TCK-2500.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=liste&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Liste », « Galerie », « Filtres », téléphone et bureau.
- Densité « Liste » par défaut au téléphone (photo de 112 px), « Galerie » à un geste ; le choix est mémorisé sur l'appareil.
- Filtres actifs en puces retirables, collées sous l'en-tête ; Filtres et Carte en pastille flottante au-dessus de la barre d'onglets, jamais en deuxième barre.
- Feuille de filtres dans l'ordre de l'usage : Louer/Acheter, budget (avec histogramme), quartier, chambres, type, logement.
- « Voir N biens de plus » remplace la pagination numérotée.
- Deux éléments au plus sur une photo : favori, et « Nouveau » quand il l'est ; « Sponsorisé » en mention sobre.

## Contraintes strictes (métier)

- Le retour arrière depuis une fiche ramène au même bien dans la liste (position et biens déjà chargés).
- L'URL reste la source des filtres (partage, recherche sauvegardée) ; la densité n'entre pas dans l'URL.
- Aucun filtre existant ne disparaît : seul l'ordre change (« autour de moi », amenités, etc. restent).

## Delta à produire

- [ ] Densités Liste / Galerie et leur mémorisation.
- [ ] Feuille de filtres réordonnée ; budget avec histogramme.
- [ ] « Voir N biens de plus » et restauration de la position au retour.
- [ ] Tests : ordre de la feuille ; densité mémorisée ; retour arrière à la même place.

## Critères d'acceptation

- [ ] AC1 — À 390 px en densité Liste, au moins quatre biens sont visibles dans le premier écran de résultats.
- [ ] AC2 — Le budget et les chambres sont visibles à l'ouverture de la feuille de filtres, sans défiler.
- [ ] AC3 — Fiche ouverte depuis le 30e bien puis retour : le 30e bien est à l'écran.

## Hors périmètre

- La carte (vue inchangée).
- Le placement des sponsorisés côté API (TCK-2500).

## Notes d'implémentation

_(à remplir par implementing-specs)_
