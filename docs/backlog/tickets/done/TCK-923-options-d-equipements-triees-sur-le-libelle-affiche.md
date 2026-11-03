---
id: TCK-923
title: "Options d'équipements triées sur le libellé affiché"
status: done
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
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-16"
tags: [front, i18n, pistes]
---

## Contexte

Réf : **P30.06** du fichier de pistes, `validé` (V7 et V8 accordés). Deuxième des quatre tickets
de la piste (TCK-922 à TCK-925).

L'API ordonne les équipements par leur nom français (`TagController::index` : `defaultSort('name')` ;
`GeoReferentialController` : `COLLATE "und-x-icu"`). `ChampEquipements` (formulaire du bien) et
`ChoixDEquipements` (filtre de la recherche) traduisaient les libellés sans retrier : en anglais, la
liste commençait par « Lift · Balcony · Backup generator… ». Le comparateur trie déjà sur le libellé
affiché (`compare-rows.ts`, `amenityNames`).

## Décision du porteur

validé — les quatre correctifs, un ticket chacun : étiquettes CRM traduites par slug, options retriées sur le libellé affiché, otherTagNames par le même traducteur, nom tapé égal à un libellé traduit résolu vers l'équipement ; en wo, le texte français tel quel (wolof en pause depuis le 2026-10-16)

## Objectif utilisateur

Un anglophone parcourt la liste des équipements dans l'ordre alphabétique de ce qu'il lit.

## Delta à produire

- [x] Les options de `ChampEquipements` et de `ChoixDEquipements` se trient sur leur libellé, par
  `localeCompare` dans la langue de l'écran (`useLocale`).

## Critères d'acceptation

- [x] AC1 — En anglais, le formulaire du bien et le filtre de recherche listent « Backup generator,
  Balcony, Lift, Swimming pool » pour un catalogue servi « Ascenseur, Balcon, Groupe électrogène,
  Piscine ».
- [x] AC2 — En français, l'ordre reste celui du nom.

## Hypothèses

- Un équipement de l'URL que le catalogue ignore (`ChoixDEquipements`) était listé en tête ; il est
  désormais trié avec les autres.

## Notes d'implémentation

- **Reproduction** : `search/__tests__/ordre-des-equipements.tck-923.test.tsx` → 2 rouges sur 3
  (l'anglais), la liste rendue étant « Lift, Balcony, Backup generator, Swimming pool ».
- **Ablation** : les deux composants d'avant → 2 rouges ; remis → 3 verts, et 450 verts sous
  `property-form/`, `ChoixDuReferentiel` et `FilterSidebar`.
