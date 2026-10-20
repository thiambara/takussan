---
id: TCK-1071
title: "La recherche dans les messages ne dit plus quelles conversations existent (P62.05)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md"
tags: [back, search, messaging, authorization, pistes]
---

## Objectif utilisateur

Un compte connecté ne peut plus apprendre, en filtrant sa recherche de messages par conversation,
qu'un fil dont il n'est pas participant existe.

## Contexte

Réf : **P62.05** du fichier de pistes (angle 62), `validé` par le porteur (critère V2 accordé).

`SearchQueryRequest::authorize()` rend `true`, et `filter.conversation` portait
`exists:conversations,id`. Le service borne déjà la recherche aux fils de l'appelant
(`MessageSearchService::search()`) : un fil tiers rendait une page vide, un fil absent 422 sur
`filter.conversation`. La même requête sert `SearchDocumentController`, qui ne lit pas ce filtre.

## Décision du porteur

> (a) comme P62.01 : `['nullable', 'integer']` seul, page vide pour un fil absent comme pour un fil tiers (porteur, 2026-10-20)

## Contrat de données

`GET /api/search/messages` : forme inchangée ; `filter[conversation]` absent rend 200 et une page
vide, comme un fil tiers.

## Delta à produire

- [x] `SearchQueryRequest` : `filter.conversation` `['nullable', 'integer']`.
- [x] `ExistsSurRouteOuverteTest` : l'exception `SearchQueryRequest` (P62.05) est retirée.
- [x] Test : `tests/Feature/Search/MessageSearchExistenceOracleTest.php`.

## Critères d'acceptation

- [x] AC1 — fil absent et fil tiers : même statut (200) et même corps (page vide).
- [x] AC2 — un fil de l'appelant garde ses résultats ; `filter[conversation]=abc` reste un 422.

## Hors périmètre

- P62.06 et P62.07.

## Notes d'implémentation

- Ablation : `exists:conversations,id` remis → AC1 rouge (422 sur `filter.conversation` contre 200
  vide) ; retiré → 2 verts, 24 sur les quatre classes voisines (`MessageSearchTest`,
  `DocumentSearchTest`, `ExistsSurRouteOuverteTest`).
