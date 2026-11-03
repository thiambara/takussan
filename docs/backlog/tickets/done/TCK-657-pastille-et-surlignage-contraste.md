---
id: TCK-657
title: "La pastille de prix de la carte et le surlignage des suggestions tiennent 4,5:1"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa
tags: [front, accessibilite, contraste, recherche, pistes]
---

## Contexte

Réf : **P07.01** du fichier de pistes (classement A4 : contraste ramené sur des jetons existants,
sans texte ni choix de produit). Deux textes de la recherche publique sont sous le seuil AA de
4,5:1 (WCAG 2.2 §1.4.3) :

- la pastille de prix des marqueurs de carte (`.takussan-price-marker__pill`, `globals.css`)
  recopie `#c87a52` et `#b66c43` en dur sous l'encre `#fcf9f3` : 3,14:1 au repos, 3,83:1 au
  survol, pour un texte de 12 px ;
- le `<mark>` qui surligne la saisie dans les suggestions (`SearchAutocomplete.tsx`) est en
  `text-primary` sur `bg-primary/15` : 4,33:1 sur le menu, moins sur une ligne active ou survolée.

## Objectif

Les deux textes tiennent 4,5:1 dans les deux thèmes, sur les jetons du design system.

## Delta à produire

- [x] `globals.css` : la pastille lit `var(--primary)` sous `var(--primary-foreground)`, et son
      survol/focus `var(--primary-deep)` (le patron du bouton plein).
- [x] `SearchAutocomplete.tsx` : le `<mark>` passe en `text-[var(--primary-deep)]` sur
      `bg-primary/10`.
- [x] Test : `search/__tests__/pastille-et-surlignage.contraste.test.ts`, qui lit les deux
      fichiers et mesure chaque couple dans les deux thèmes.
- [x] `surface-publique.contraste.test.ts` : l'entrée d'ardoise du `<mark>` sort (le couple n'existe
      plus sous cette forme).

## Critères d'acceptation

- [x] AC1 — Pastille, encre sur fond ≥ 4,5:1 au repos et au survol, en clair et en sombre.
- [x] AC2 — `<mark>`, encre sur aplat ≥ 4,5:1 sur le menu `bg-card`, sur la ligne active
      (`bg-primary/8`) et sur la ligne survolée (`bg-muted/50`), en clair et en sombre.
- [x] AC3 — Aucune valeur de couleur recopiée en dur ne reste dans la règle de la pastille.

## Hypothèses (mode sans humain)

- En thème sombre, l'encre de la pastille suit `--primary-foreground` (sombre), comme le bouton
  plein : garder `#fcf9f3` y laissait 3,14:1. La bordure claire de la pastille ne porte pas de
  texte et reste telle quelle.
- L'aplat du `<mark>` passe de 15 % à 10 % : à 15 %, la ligne active en thème sombre restait à
  4,46:1. Moins d'opacité donne plus de contraste (`docs/design-guidelines.md`, « L'aplat d'une
  pastille sémantique »).

## Hors périmètre

- Le même motif ailleurs (`text-primary` sur `bg-primary/8` de `SearchToolbar.tsx`, et la ligne
  active des suggestions en `text-primary` sur `bg-primary/8`), que l'ardoise de
  `surface-publique.contraste.test.ts` compte encore.
- Le libellé et le focus du champ de recherche : P07.06.

## Notes d'implémentation

- Rouge avant correctif : 10 échecs sur 11 (pastille 3,14 et 3,83:1 dans les deux thèmes ;
  `<mark>` de 3,49 à 4,33:1 selon la ligne et le thème).
- Avec le seul passage à `--primary-deep` et l'aplat laissé à 15 % : un rouge, la ligne active en
  sombre à 4,46:1. D'où les 10 %.
- Ablation (`globals.css` et `SearchAutocomplete.tsx` remis à l'état d'avant, test gardé) :
  10 rouges ; correctif remis : 11 verts.
- `text-[var(--primary-deep)]` est une valeur arbitraire, que le lecteur statique de
  `couples-de-contraste.ts` ignore : c'est pourquoi le test dédié lit le `<mark>` lui-même.
