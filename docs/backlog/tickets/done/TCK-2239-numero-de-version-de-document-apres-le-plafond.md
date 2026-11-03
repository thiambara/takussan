---
id: TCK-2239
title: "Le numéro d'une version de document suit le plus grand existant, sous le verrou du document"
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
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations--numérotation-des-versions-de-document"
tags: [api, documents, pistes]
---

## Objectif

`DocumentVersionService::uploadVersion` numérote une version par le plus grand numéro existant
plus un, sous le verrou de la ligne `Document`, au lieu de `count() + 1`.

## Contexte

Réf : **P231.05** du fichier de pistes, `retenu · autonome` (A1 : TCK-097 décrit des versions
« ordonnées par numéro de version » et une purge de « la plus ancienne », AC6).

Une fois le plafond de 20 atteint, `enforceCap` purge la plus ancienne : chaque envoi compte
alors 20 versions et reçoit 21. Les numéros se répètent, alors que `listVersions` trie sur eux.

## Delta à produire

- [x] `uploadVersion` : verrou `lockForUpdate` sur la ligne du document, puis `max + 1`.
- [x] `DocumentVersionTest::test_les_numeros_restent_distincts_et_croissants_au_dela_du_plafond`.

## Critères d'acceptation

- [x] AC1 — 22 envois → numéros 1 à 22, distincts ; restent 3 à 22 ; les purges journalisées
  portent 1 puis 2.
- [x] AC2 — le premier envoi reste numéroté 1 (contrat de TCK-097, `DocumentVersionTest:63`).

## Hors périmètre

- Le fichier d'origine (`file`) n'est pas une version et le premier envoi reste numéroté 1 : le
  mesureur ne l'a pas retenu, c'est le contrat de TCK-097.

## Notes d'implémentation

- Avant correctif : le 22ᵉ envoi reçoit 21 (1 rouge).
- Ablation : `count() + 1` remis → 1 rouge sur 12 ; remis → 12 verts.
- `max()` sur une collection vide rend `null`, d'où le `(int)` : le premier numéro reste 1.
