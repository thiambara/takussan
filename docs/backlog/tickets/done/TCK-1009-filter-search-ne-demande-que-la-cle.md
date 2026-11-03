---
id: TCK-1009
title: "`filter[search]` ne demande au moteur que la clé Scout de chaque correspondance"
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
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-59--requêtes-sql-des-listes-filtersearch-et-de-la-recherche-publique-index-peuplé"
tags: [api, search, performance, pistes]
---

## Contexte

Réf : **P59.01** du fichier de pistes, `retenu · autonome` (A2). Le callback `filter[search]` de
`HasQueryBuilder` appelle `$model::search($value)->take(SEARCH_ID_CAP)->keys()` sans option :
Scout envoie `{"q":…,"hitsPerPage":5000}` sans `attributesToRetrieve`, et Meilisearch rend le
document entier de chaque correspondance, dont `keys()` ne garde que la clé. Re-mesuré le
2026-10-19 sur `pre-dev` bde1d5b43 en lisant les envois du client Meilisearch : ni la liste des
biens ni celle des clients ne portent `attributesToRetrieve`.

## Objectif

La recherche des listes pro ne rapatrie que la clé Scout ; les lignes rendues et leur ordre sont
inchangés.

## Delta à produire

- [x] `HasQueryBuilder` : `->options(['attributesToRetrieve' => [getScoutKeyName()]])` dans le
      callback `search`.
- [x] `tests/Feature/Search/FilterSearchProjectionTest.php` : biens et clients, la requête envoyée
      ne demande que `id`, la liste rendue reste juste (périmètre d'agence, titre hydraté).

## Critères d'acceptation

- [x] AC1 — `GET /api/properties?filter[search]=…` : la recherche envoyée à l'index `properties`
      porte `attributesToRetrieve` réduit à `id` ; un seul bien, celui de l'agence, est rendu.
- [x] AC2 — Même chose pour `GET /api/customers?filter[search]=…`.
- [x] AC3 — Les tests de pertinence et de périmètre existants restent verts.

## Reste à faire

- `MessagingContactController::index` (`:112-116`) passe la même recherche sans projection sur
  l'index `users` : laissé de côté parce que la PR #734 (P51.04) réécrit ce bloc ; à reprendre
  une fois celle-ci fusionnée.

## Hypothèses (mode sans humain)

- Scout ajoute d'office la clé Scout à `attributesToRetrieve` (lu, `MeilisearchEngine::performSearch()`) :
  la liste envoyée répète donc `id`, ce que le moteur réel accepte (les tests le jouent). Le test
  compare la liste dédoublonnée.
- Le gain en octets et en durée n'est pas re-mesuré (mesures de l'explorateur dans l'entrée).

## Hors périmètre

- Le coût SQL des 5 000 ids (`whereIn`, `CASE` de pertinence) : P16.04.

## Notes d'implémentation

- Avant correctif : 2 rouges sur 2 (`attributesToRetrieve` absent), lignes rendues justes.
  Ablation : `HasQueryBuilder.php` remis à `pre-dev` → 2 rouges ; correctif réappliqué → 2 verts.
- Voisins (`CustomerSearchTest`, `PropertyDashboardSearchTest`, `MaintenanceRequestSearchTest`,
  `DocumentListRelevanceTest`, `UserSearchTest`, `AgencySearchTest`, `UserAdminTest`,
  `ReviewReportAndDocSearchTest`, `TagProposalRechercheTest`) : 45 verts.
