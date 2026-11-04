---
id: TCK-910
title: "Recherche publique : retirer les facettes que personne ne lit"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-facettes-sont-calculées-à-chaque-recherche-et-personne-ne-les-lit"
tags: [back, front, search, pistes]
---

## Contexte

Réf : **P01.08** du fichier de pistes, `validé` (V7 accordé).

`PropertySearchService` demandait à Meilisearch la distribution de `neighborhood`, `bedrooms` et
`type` à chaque recherche publique, en régime nominal comme sous le repli élargi, et la rendait
sous la clé `facets` de `GET /api/public/properties/search`. Le front ne la lisait nulle part :
seule la déclaration `Facets` de `types/search.ts` et des fixtures de tests la mentionnaient.

## Décision du porteur

validé — retirer les facettes

## Objectif utilisateur

Aucun changement visible : la recherche publique cesse de calculer ce que personne n'affiche.

## Delta à produire

- [x] `PropertySearchService` : plus de paramètre `facets` vers Meilisearch (requête nominale et
  requête élargie du `/multi-search`), plus de clé `facets` dans la réponse, `mapFacets()` retiré.
- [x] `takussan-web/src/types/search.ts` : `Facets` et `SearchResult.facets` retirés ; les fixtures
  de tests ne portent plus la clé.
- [x] Tests : la clé est absente du service et de l'endpoint, sous `all` comme sous `widened`.

## Critères d'acceptation

- [x] AC1 — `PropertySearchService::search()` ne rend pas de clé `facets`.
- [x] AC2 — `GET /api/public/properties/search` ne rend pas `facets`, ni en régime nominal ni
  sous le repli élargi.
- [x] AC3 — `tsc --noEmit` reste propre sans le type `Facets`.

## Hors périmètre

- La recherche de valeurs de facette (`POST /indexes/{uid}/facet-search`) des villes et quartiers,
  qui sert le domaine des facettes d'URL : elle n'est pas concernée.
- `SearchWolofReviewSheet` (commande de revue), qui demande ses propres facettes.
- ADR-0024 cite encore `facets` dans la forme du contrat (l. 101, 112) : `docs/adr/` est fermé à
  l'implémenteur, la mise à jour revient au porteur.
- Des facettes visibles (« Mermoz (43) ») : l'autre voie de la piste, écartée par la décision.

## Notes d'implémentation

- Ablation : `PropertySearchService.php` de `pre-dev` remis → les 3 tests (`PropertySearchServiceTest`,
  `PropertySearchTest`, `RechercheConjonctiveTest`) rouges ; correctif remis → verts.
- Le test garde la réponse, pas la requête au moteur : le paramètre `facets` ne peut plus partir
  parce que la constante `FACETS` n'existe plus, et aucune ligne du service ne le nomme.
