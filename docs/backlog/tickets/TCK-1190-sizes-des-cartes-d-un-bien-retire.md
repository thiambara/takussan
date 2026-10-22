---
id: TCK-1190
title: "Bien retiré : les cartes similaires déclarent le `sizes` de leur grille"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-cartes-de-la-page-dun-bien-retiré-héritent-des-sizes-de-la-grille-de-recherche-qui-ne-décrivent-pas-leur-grille"
tags: [front, performance, images, public, pistes]
---

## Contexte

Réf : **P102.03** du fichier de pistes, `retenu · autonome` (A1 et A2 : le docblock de
`PropertyCard` dit que `sizes` « appartient à la grille appelante, pas à la carte », et chaque
autre grille a sa constante dans `card-image-sizes.ts`).

`bienRetire()` ne passe pas `sizes` : ses cartes retombent sur `CARD_SIZES_SEARCH_GRID`, qui
décrit la grille de `/properties`. Elles sont sous-déclarées (279 px déclarés pour 418 réels à
900 px, 252 pour 352 à 1 440 px), donc servies trop petites.

## Objectif

Les cartes de la page d'un bien retiré déclarent le `sizes` de leur grille, et aucun appelant de
`PropertyCard` ne peut plus l'omettre sans qu'un test rougisse.

## Delta à produire

- [x] `CARD_SIZES_BIEN_RETIRE` dans `card-image-sizes.ts`, avec son relevé calculé.
- [x] `bien-retire.tsx` la passe à ses cartes.
- [x] `card-image-sizes.bien-retire.test.ts` : la constante suit la grille à chaque largeur de
      320 à 2560 px, et chaque `<PropertyCard … />` de `src` passe `sizes`.

## Critères d'acceptation

- [x] AC1 — `CARD_SIZES_BIEN_RETIRE` n'est jamais sous l'emplacement calculé, et jamais plus de
      40 px au-dessus, de 320 à 2560 px.
- [x] AC2 — Un appelant de `PropertyCard` sans `sizes` fait rougir la garde.

## Hors périmètre

- Une mesure au navigateur des requêtes d'image : la constante est calculée depuis les classes,
  comme celle des rangées de l'accueil.
- Le `priority` des mêmes cartes : TCK-1188.

## Hypothèses

- Le conteneur `max-w-6xl` porte aussi les marges (`box-sizing: border-box` de Tailwind) : 1 152 px
  marges comprises, ce que le calcul du mesureur (352 px à 1 440 px) retient aussi.

## Notes d'implémentation

- Ablation (2026-10-22) : la ligne `sizes={CARD_SIZES_BIEN_RETIRE}` retirée de `bien-retire.tsx`
  → la garde des appelants rougit (`[locale]/(public)/properties/[slug]/bien-retire.tsx`) ; remise
  → 4/4 verts. Avant la constante, les deux tests de géométrie rougissaient aussi (constante
  absente).
- La garde balaie les `.tsx` de `src` hors `__tests__` et coupe chaque élément au premier `/>` : un
  appelant qui passerait des enfants à la carte (`<PropertyCard>…</PropertyCard>`) lui échapperait.
  La carte n'en prend pas aujourd'hui.
