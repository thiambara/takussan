---
id: TCK-662
title: "La recherche des biens dans /app est classée par pertinence"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-1--recherche-dun-bien
tags: [back, front, search, pistes]
---

## Contexte

Réf : **P01.01** du fichier de pistes, `validé` par le porteur.

TCK-281 a donné aux listes internes la restitution de l'ordre de Meilisearch
(`HasQueryBuilder::defaultSortsWithRelevance()`). La liste des biens de `/app` n'en profitait pas :
`PropertyController::index` posait `defaultSort('-created_at')` en dur, et le front envoyait
toujours `sort=-created_at` (la page remplaçait un tri absent par `-created_at`, et
`fetchDashboardProperties` aussi). Une recherche tolérante aux fautes rendait donc ses résultats
classés par date.

## Décision du porteur

pertinence seule (defaultSortsWithRelevance, sort non forcé pendant une recherche)

Le reste de la piste (recherche SQL interne ou second index, pour trouver les brouillons et les
biens privés) n'est pas accordé : il relève de TCK-578 et de son ADR.

## Objectif

Sans tri choisi, une recherche dans « Mes biens » rend ses résultats dans l'ordre de pertinence.

## Delta à produire

- [x] `PropertyController::index` : `defaultSorts(...Property::defaultSortsWithRelevance('-created_at'))`,
      évalué après `buildQuery()`, comme `CustomerController`.
- [x] `properties-server.ts` (`buildListParams`) : aucun `sort` par défaut quand `filters.search`
      est posé ; `-created_at` sinon.
- [x] Page `/app/properties` : un tri absent ou inconnu n'est plus remplacé par `-created_at`.
- [x] Tests : `PropertyDashboardSearchTest` (+2), `properties.test.ts` (+2),
      `tri-par-pertinence.tck-662.test.tsx` (2).

## Critères d'acceptation

- [x] AC1 — `GET /api/properties?filter[search]=…` sans `sort` rend les biens dans l'ordre de
      Meilisearch, pas par date de création.
- [x] AC2 — Un `sort=` explicite reste souverain pendant une recherche.
- [x] AC3 — Le front n'envoie pas `sort` pendant une recherche sans tri choisi, et garde le tri
      choisi sinon ; hors recherche, `sort=-created_at` reste envoyé.

## Hypothèses (mode sans humain)

- Les compteurs (KPI) de la page n'ont pas de recherche : leur tri ne change pas.

## Hors périmètre

- Brouillons, biens privés, en revue ou rejetés absents de l'index, donc introuvables par la
  recherche interne : TCK-578 (ADR requis).
- `matchingStrategy` de la recherche interne, non re-mesuré.
- Les autres listes internes qui forcent `sort` pendant une recherche (clients, interventions) :
  P16.02, entrée distincte.

## Notes d'implémentation

- Rouge avant correctif : API, ordre rendu `[2 fautes, 1 faute, exact]` (date) au lieu de
  `[exact, 1 faute, 2 fautes]` ; front, `sort=-created_at` envoyé pendant une recherche, par la
  page comme par `fetchDashboardProperties`.
- Ablation, correctif par correctif : contrôleur retiré → seul le test de pertinence API rougit ;
  `buildListParams` retiré → seul le test de la couche requête rougit ; page retirée → seul le
  test de page rougit. Remis → vert.
