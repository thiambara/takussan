---
id: TCK-1853
title: "`type` et `rent_period` jugés contre leur enum sur la recherche publique et les alertes, `per_page` validé sur le portefeuille"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-187--paramètres-des-routes-publiques-sans-compte-face-à-une-valeur-mal-formée"
tags: [back, public, search, saved-searches, pistes]
---

## Contexte

Réf : **P187.06** du fichier de pistes, `validé (délégué)` (critère V7 accordé). Mesuré avant
correctif, par les tests de garde ci-dessous sans le correctif : `search?type=nope`,
`search?type=villa,nope` et `search?rent_period=nope` rendaient 200 (catalogue écarté en silence,
`total=0`), une alerte acceptait `type: ['villa', 'nope']` et `rent_period: 'nope'`, et
`per_page=abc` ou `per_page[]=3` sur le portefeuille d'un agent ou d'une agence rendaient 200.

## Décision du porteur (déléguée)

> juger `type` valeur par valeur contre `PropertyType` (même fermeture que `condition`, TCK-508) et `rent_period` par `Rule::enum(RentPeriod::class)` dans `SearchPublicPropertyRequest` (la carte en hérite), et les mêmes règles de valeur dans `SavedSearchCriteria` (`type` par le second argument de `listeDeChaines`, `rent_period` par `Rule::enum`), pour qu'une alerte ne stocke pas ce que `/properties` refuse ; `per_page` validé `nullable|integer|min:1` dans `PublicPortfolioRequest`, la borne haute restant le `min(…, 48)` des deux contrôleurs (aucun 422 neuf au-delà de 48) ; tests : `type=nope`, `type=villa,nope` et `rent_period=nope` → 422 sur `/properties/search`, la même chose à la création d'une alerte, `per_page=abc` et `per_page[]=3` → 422 sur les deux portefeuilles

## Hypothèses (mode sans humain)

- Un segment vide de `type` (`type=villa,`) reste accepté et ignoré, des deux côtés : le moteur
  (`PropertySearchService`, `array_filter` après `explode`) l'ignore déjà, et le refuser ferait
  rendre 422 à une forme que rien ne désigne comme fautive. `condition` le refuse, elle : l'écart
  est laissé tel quel.
- Les alertes déjà stockées ne sont pas relevées ni réécrites (V4) : la règle ne juge qu'à la
  création et à la modification.

## Delta à produire

- [x] `SearchPublicPropertyRequest` : `type` jugé valeur par valeur contre `PropertyType`,
  `rent_period` par `Rule::enum(RentPeriod::class)` (`MapPublicPropertyRequest` en hérite).
- [x] `SavedSearchCriteria::rules()` : mêmes règles de valeur pour `type` et `rent_period`.
- [x] `PublicPortfolioRequest` : `per_page` `nullable|integer|min:1`.
- [x] Tests : `PublicPropertySearchFiltersTest`, `SavedSearchCriteriaVocabularyTest`,
  `PortefeuilleFiltreParContratTest`.

## Critères d'acceptation

- [x] AC1 — `/properties/search?type=nope`, `?type=villa,nope`, `?rent_period=nope` → 422 ;
  `?type=villa,house&rent_period=monthly` → 200.
- [x] AC2 — la même chose à la création d'une alerte, sur le compte comme sans compte ; rien n'est
  stocké.
- [x] AC3 — `per_page=abc` et `per_page[]=3` → 422 sur les deux portefeuilles ; `per_page=100`
  → 200, `meta.per_page` 48.

## Hors périmètre

- La carte (`/properties/map`) hérite des règles sans test propre ici.

## Notes d'implémentation

- Ablation : les trois fichiers de `app/` de `pre-dev` remis → 3 rouges (`PublicPropertySearchFiltersTest`),
  3 rouges (`SavedSearchCriteriaVocabularyTest`), 4 rouges (`PortefeuilleFiltreParContratTest`) ;
  correctif remis → 32, 48 et 12 verts, `MapFiltersParityTest` 31 verts.
- Piège : `test_la_forme_exacte_du_front_est_acceptee` envoyait `type: ['type', 'villa']`, `type`
  n'étant pas un `PropertyType` ; la valeur passe à `['house', 'villa']`.
