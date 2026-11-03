---
id: TCK-924
title: "Comparateur : les autres étiquettes passent par le traducteur des équipements"
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
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-16"
tags: [front, i18n, pistes]
---

## Contexte

Réf : **P30.06** du fichier de pistes, `validé` (V7 et V8 accordés). Troisième des quatre tickets
de la piste (TCK-922 à TCK-925).

Dans le comparateur, la ligne « Équipements » passe par `libelleEquipement` (TCK-633), mais la
ligne « Tags » (`otherTagNames`, `compare-rows.ts`) rendait `tag.name` : un `feature` du catalogue
que `tags:sync-catalog` n'a pas encore converti en `amenity` restait en français sous l'anglais.

## Décision du porteur

validé — les quatre correctifs, un ticket chacun : étiquettes CRM traduites par slug, options retriées sur le libellé affiché, otherTagNames par le même traducteur, nom tapé égal à un libellé traduit résolu vers l'équipement ; en wo, le texte français tel quel (wolof en pause depuis le 2026-10-16)

## Objectif utilisateur

Dans le comparateur, toutes les étiquettes d'un bien se lisent dans la langue de l'écran.

## Delta à produire

- [x] `otherTagNames` reçoit le même `LibelleDEquipement` que `amenityNames`, et trie sur le libellé
  qu'il rend.

## Critères d'acceptation

- [x] AC1 — En anglais, un `feature` « Groupe électrogène » s'affiche « Backup generator », trié
  avec les autres sur le libellé affiché ; une étiquette hors catalogue reste telle quelle.
- [x] AC2 — Sans traducteur (appelant hors React), le nom en base.

## Notes d'implémentation

- **Reproduction** : `compare/__tests__/compare-rows.autres-etiquettes.tck-924.test.ts` → 1 rouge
  sur 2 (`['Ascenseur', 'Coup de cœur', 'Groupe électrogène']`).
- **Ablation** : `compare-rows.ts` d'avant → 1 rouge ; remis → 2 verts, et 61 verts sous `compare/`.
