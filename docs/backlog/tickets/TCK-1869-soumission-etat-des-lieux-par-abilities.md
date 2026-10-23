---
id: TCK-1869
title: "La fiche d'un état des lieux ne montre « Soumettre » et l'ajout de photos qu'à qui `InventoryPolicy::update` l'accorde"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-189--gestes-montrés-par-une-comparaison-didentité-ou-de-rôle-dans-les-détails-refusés-par-la-policy"
tags: [back, front, inventory, permissions, pistes]
---

## Objectif utilisateur

Le locataire, et le bailleur suspendu dans l'agence du bien, ne se voient plus offrir
« Soumettre » ni l'ajout de photos sur un état des lieux en brouillon, que l'API leur refuse.

## Contexte

Réf : **P189.02** du fichier de pistes, `retenu · autonome` (A1 : la règle est écrite dans
`InventoryPolicy::update`, qui garde `submit`, le dépôt et le retrait de photos).

La fiche juge ces gestes sur le seul statut `draft` ; `InventoryResource` ne sert que
`can_sign_as`.

## Hypothèses (mode sans humain)

- Comme le recommande la Piste : `InventoryResource` sert `abilities.update`, calculé par
  `InventoryPolicy::update` pour le lecteur de `forViewer()` (comme `can_sign_as`).
- Le retrait d'une vignette, gardé lui aussi par `update` (`destroyRoomPhoto`) et monté par le même
  drapeau que l'ajout, suit le même verdict.
- La signature et la contestation ne changent pas.

## Delta à produire

- [x] `InventoryResource` : `abilities.update` sous `forViewer()`.
- [x] Front : « Soumettre » et le dépôt de photos ne s'ouvrent que sur un brouillon **et**
  `abilities.update`.
- [x] Tests : API (locataire et bailleur suspendu → `false`, bailleur actif → `true`) ;
  `InventoryDetail` avec `abilities.update = false` sur un brouillon.

## Critères d'acceptation

- [x] AC1 — `GET /api/inventories/{id}` rend `abilities.update` à `false` pour le locataire et pour
  le bailleur auteur suspendu, à `true` pour le bailleur auteur actif.
- [x] AC2 — Sur un brouillon, sans `abilities.update`, la fiche ne monte ni « Soumettre » ni le
  dépôt de photos.

## Hors périmètre

- Toute règle de `InventoryPolicy`.
- La signature (`can_sign_as`) et la contestation.

## Notes d'implémentation

- Ablation : `abilities` retiré d'`InventoryResource` → `InventoryAbilitiesTest` rouge ; la fiche
  remise sur le seul statut → 2 rouges dans `InventoryDetail.pieces.test.tsx` ; remis → verts.
  Côté front, le correctif a précédé le test : le rouge n'y est établi que par cette ablation.
- `DateInventoryByValueTest` inscrit la clé neuve, comme pour `LeaseResource::abilities`
  (TCK-1424) : le parcours ne pose pas de lecteur.
- La fixture d'`InventoryDetail.pieces.test.tsx` porte désormais `abilities.update = true` : ses
  tests de dépôt supposent un auteur qui peut modifier.
