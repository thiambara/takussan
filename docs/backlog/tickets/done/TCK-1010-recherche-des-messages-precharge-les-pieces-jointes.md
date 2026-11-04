---
id: TCK-1010
title: "La recherche des messages précharge les pièces jointes de la page"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-59--requêtes-sql-des-listes-filtersearch-et-de-la-recherche-publique-index-peuplé"
tags: [api, search, messaging, performance, pistes]
---

## Contexte

Réf : **P59.02** du fichier de pistes, `retenu · autonome` (A2). `MessageSearchService::search()`
rend le paginateur de Scout sans préchargement, et `MessageResource::attachments()` lit
`getMedia('attachments')` sur chaque message : une requête `media` par ligne.
`DocumentSearchService` fait déjà `loadMissing('media')`. Re-mesuré le 2026-10-19 sur `pre-dev`
bde1d5b43, Meilisearch réel, participant d'un fil : 19 requêtes pour 2 messages, 29 pour 12, dont
une `select * from "media" where "model_id" in (<un id>)` par message.

## Objectif

`GET /api/search/messages` coûte le même nombre de requêtes pour 2 et pour 12 messages ; la réponse
est inchangée.

## Delta à produire

- [x] `MessageSearchService::search()` : `$paginator->getCollection()->loadMissing('media')`.
- [x] `tests/Feature/Search/SearchQueryBudgetTest.php` : budget « 2 lignes = 12 lignes » sur la
      route, index peuplé (`InteractsWithMeilisearch`).

## Critères d'acceptation

- [x] AC1 — 2 messages trouvés et 12 messages trouvés : même nombre de requêtes.
- [x] AC2 — `MessageSearchTest`, `SearchDateRangeTest`, `MaintenanceThreadAccessTest` restent verts.

## Hypothèses (mode sans humain)

- La route n'a pas d'appelant dans `takussan-web/src` (P13.08) ; son retrait, autre option de la
  piste, est un choix de produit (V7) et n'est pas fait ici.

## Hors périmètre

- Le retrait de la route (P13.08).

## Notes d'implémentation

- Avant correctif : 19 requêtes pour 2 lignes, 29 pour 12 (10 `media` par message en plus).
  Ablation : service remis à `pre-dev` → rouge (19/29) ; correctif réappliqué → vert.
- Voisins : 20 verts (`SearchQueryBudgetTest`, `MessageSearchTest`, `SearchDateRangeTest`,
  `MaintenanceThreadAccessTest`).
