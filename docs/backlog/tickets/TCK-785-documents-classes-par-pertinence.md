---
id: TCK-785
title: "La liste des documents classe une recherche par pertinence"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-16--listes-internes-sur-un-modèle-searchable"
tags: [back, search, documents, pistes]
---

## Contexte

Réf : **P16.03** du fichier de pistes, `validé` (critère accordé : V2, avec V7 pour la partie tri).
`DocumentController::index()` combinait la recherche Scout (`filter[search]`) avec un
`->defaultSort('-created_at')` en dur : la recherche tolérait les fautes, mais l'ordre de
Meilisearch était jeté, contrairement aux quatre listes que TCK-281 classe par pertinence.

## Décision du porteur

defaultSortsWithRelevance('-created_at') seulement ; reste : le périmètre de lecture des documents, par agence ou par documentable

## Reste à faire

le périmètre de lecture des documents, par agence ou par documentable

## Delta à produire

- [x] `DocumentController::index()` : `defaultSorts(...Document::defaultSortsWithRelevance('-created_at'))`,
      évalué après `buildQuery()`.
- [x] `DocumentListRelevanceTest`.

## Critères d'acceptation

- [x] AC1 — `GET /api/documents?filter[search]=…` sans `sort=` rend les documents dans l'ordre de
      pertinence.
- [x] AC2 — Un `sort=` explicite l'emporte sur la pertinence.
- [x] AC3 — Sans recherche, le plus récent d'abord, comme avant.

## Hors périmètre

- Le périmètre `uploaded_by = moi` de la liste (reste).

## Hypothèses (mode sans humain)

- Aucune : le correctif reprend la forme exacte de `CustomerController::index()`.

## Notes d'implémentation

- Ablation : contrôleur remis à `pre-dev` → 1 rouge sur 3 (AC1) ; remis → 3 verts.
