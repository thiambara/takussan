---
id: TCK-863
title: "Catalogue public : un index partiel (ranked_at desc nulls last, id desc) pour lire l'ordre organique sans tri"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes"
tags: [back, index, performance, catalogue, pistes]
---

## Objectif utilisateur

La liste publique des biens se sert par un index dans son ordre organique, sans trier toutes les
lignes publiques à chaque page.

## Contexte

Réf : **P02.12** du fichier de pistes, `retenu · autonome` (A2).

`PublicPropertyController::index()` trie sur `ranked_at DESC NULLS LAST, id DESC`.
`properties_ranked_at_idx` (migration `2026_10_12_500300`) est en ASC, NULLS LAST : parcouru à
l'envers, il rend les NULL en tête, et ne sert donc pas cet ordre.

## Contrat de données

- Migration neuve `index_properties_on_public_ranked_order` : index partiel
  `properties_public_ranked_order_idx` sur `(ranked_at DESC NULLS LAST, id DESC)`
  `WHERE visibility = 'public' AND NOT is_test`, `down()` qui le retire. L'index `ranked_at`
  existant reste.

## Contraintes strictes (métier)

- Aucun résultat ne change : ajout d'index seul.

## Delta à produire

- [x] Migration d'ajout d'index (neuve), avec son `down()`.
- [x] Test : `Tests\Feature\Database\PublicCatalogueRankedOrderIndexTest` (index présent ; la
  requête réellement émise par `GET /api/public/properties` se lit par lui, sans `Sort`).

## Critères d'acceptation

- [x] AC1 — l'index `properties_public_ranked_order_idx` sur `(ranked_at, id)` existe.
- [x] AC2 — le plan de la requête de la liste publique (tri organique) passe par cet index, sans
  nœud `Sort`.

## Hors périmètre

- Le tri `created_desc` de la même route, que la piste ne vise pas.
- `models-spec.md` § 3 : à compléter par `/sync-specs` si elle liste les index (spec fermée à
  l'agent).

## Notes d'implémentation

- Ablation : la migration retirée, les deux tests rougissent (index absent ; plan avec
  `Sort Key: ranked_at DESC NULLS LAST, id DESC`) ; remise, verts.
- Le test capte la requête émise par la route (`DB::listen`) et la rejoue sous `EXPLAIN` avec ses
  liaisons d'origine : substituées en texte, les booléens deviennent `0` et PostgreSQL refuse
  `boolean = integer`. Le planificateur accepte l'index partiel parce que `is_test = false`
  implique `NOT is_test`.
