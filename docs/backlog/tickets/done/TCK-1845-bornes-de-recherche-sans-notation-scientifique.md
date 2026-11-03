---
id: TCK-1845
title: "Les bornes de prix et de surface partent au moteur de recherche sans notation scientifique"
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
tags: [back, public, recherche, meilisearch, pistes]
---

## Contexte

Réf : **P187.02** du fichier de pistes, `retenu · autonome` (A1). `PropertySearchService::buildFilter()`
concaténait `(float) $p['price_min']` (de même `price_max`, `area_min`, `area_max`) dans la chaîne
de filtre Meilisearch. PHP écrit un flottant d'au moins 10¹⁵ en `1.0E+15`, que le moteur refuse :
`GET /api/public/properties/search?price_min=1000000000000000` rendait 500. `alertMatches()` passe
par le même `buildFilter()`.

## Objectif utilisateur

Un visiteur qui saisit, ou reçoit dans une URL partagée, une borne de prix ou de surface très
grande obtient une page de résultats (vide), et non une erreur.

## Contrat de données

Aucun changement : `GET /api/public/properties/search`, mêmes paramètres, même validation.

## Contraintes strictes (métier)

- Un nombre fini s'écrit en notation décimale, comme `_geoBoundingBox` et `_geoRadius` (`%F`).
- Un nombre non fini (`1e400` → `INF`) garde l'écriture d'avant, qui rend déjà 200.

## Delta à produire

- [x] `PropertySearchService::nombre()`, formateur unique des quatre bornes.
- [x] Test à jeu de données dans `PublicPropertySearchFiltersTest` : sept bornes, 200 attendu, et le
  bien ordinaire présent ou absent selon la borne.

## Critères d'acceptation

- [x] AC1 — `price_min=1000000000000000`, `price_min=999999999999999`, `area_min=10²⁰` → 200, aucun bien.
- [x] AC2 — `price_max=1e20`, `area_max=1e20`, `price_min=0.00001` → 200, le bien à 50 000.
- [x] AC3 — `price_min=1e400` → 200, aucun bien (inchangé).

## Reste à faire

- Le plafond `max` des bornes de prix dans `SearchPublicPropertyRequest` et des quatre bornes dans
  `SavedSearchCriteria`, que la `Piste` proposait et que le correctif ne demande pas : il ferait
  rendre 422 à des URL qui rendent 200 aujourd'hui (la surface est bornée par P187.03, TCK-1847).

## Hors périmètre

- Les alertes enregistrées avec une telle borne : elles passent par le même `buildFilter()`, donc
  par le même correctif, mais le chemin d'envoi n'a pas été joué.

## Notes d'implémentation

- Reproduction : cinq des sept cas rouges avant correctif, 500 « unexpected characters … `+15` » ou
  `+20`. `1.0E-5` est accepté par le moteur : seul l'exposant positif (`+`) casse.
- Ablation : `nombre()` ramené à `(string) $nombre` → cinq rouges ; remis → 28/28 dans
  `PublicPropertySearchFiltersTest`, 6/6 dans `PropertySearchServiceTest`.
- Précision : dix décimales, zéros de fin retirés ; `0` reste `0`.
