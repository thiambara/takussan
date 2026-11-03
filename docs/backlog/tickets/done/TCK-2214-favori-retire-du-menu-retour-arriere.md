---
id: TCK-2214
title: "Un favori retiré depuis le menu revient quand l'API refuse, comme au cœur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-228--mutations-lancées-par-mutate-sans-onerror-et-dont-lécran-ne-lit-pas-lerreur"
tags: [front, favoris, erreurs, pistes]
---

## Contexte

Réf : **P228.03** du fichier de pistes, `retenu · autonome` (A1 : le contrat de bascule optimiste
avec retour en arrière est écrit par `FavoriteButton`, « Rollback on API failure »).

`FavoritesPopover.removeOne` retirait le bien du store local, puis lançait
`removeMutation.mutate` sans `onError` : sur un refus, le favori disparaissait du menu et des
cœurs de la session, mais restait en base.

## Delta à produire

- [x] `FavoritesPopover` : `onError` de l'appel qui remet le bien dans le store (`add`).
- [x] Test vitest `FavoritesPopover.retrait-refuse.p228-03.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un retrait refusé par l'API remet le bien dans le store.
- [x] AC2 — Un retrait accepté le laisse retiré.

## Hors périmètre

- Un crochet de bascule commun aux deux sites (l'autre voie de la `Piste`) : aucun besoin pour le
  correctif, et `FavoriteButton` n'a pas à bouger.
- Un message d'échec : le cœur n'en affiche pas non plus.

## Notes d'implémentation

- Ablation : `FavoritesPopover.tsx` de `pre-dev` → AC1 rouge (appel sans options, bien absent du
  store) ; correctif remis → 2/2 verts, et `FavoritesPopover.panneau.test.tsx` vert (6 tests).
