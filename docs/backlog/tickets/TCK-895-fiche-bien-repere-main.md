---
id: TCK-895
title: "Fiche d'un bien : un repère <main> dans chacun de ses quatre états"
status: doing
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-fiche-dun-bien-na-aucun-repère-main-dans-aucun-de-ses-quatre-états"
tags: [front, a11y, public, pistes]
---

## Contexte

Réf : **P31.02** du fichier de pistes, `retenu · autonome` (A4).

La fiche d'un bien rend `Navbar`, le corps puis `Footer` sans `<main>` autour du corps, dans ses
quatre états (trouvé, retiré, indisponible, introuvable). axe y relève `landmark-one-main` et
`region` ; les autres pages publiques ont leur `<main>`. Un lecteur d'écran n'a aucun saut vers le
contenu, après 18 arrêts de tabulation dans la barre.

## Objectif utilisateur

Un visiteur au lecteur d'écran saute directement au contenu de la fiche, quel que soit son état.

## Delta à produire

- [x] `page.tsx` : le corps des trois états qu'elle rend (trouvé, retiré, indisponible) dans un
  `<main>`, la barre et le pied de page hors de lui.
- [x] `not-found.tsx` : même chose.
- [x] Tests : chaque état rend exactement un `main`, qui contient le titre de niveau 1 et ni la
  barre ni le pied de page.

## Critères d'acceptation

- [x] AC1 — Chacun des quatre états rend un seul `main`, qui contient le `h1`.
- [x] AC2 — `Navbar` et `Footer` restent hors du `main`.
- [x] AC3 — Aucun rendu visuel ni texte neuf : `main` ne porte pas de classe.

## Hors périmètre

- Le lien d'évitement (P31.04).
- `PropertyDetailContent` : le `main` est posé par la page, pour ne pas en rendre deux.

## Notes d'implémentation

_(à remplir par implementing-specs)_
