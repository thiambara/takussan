---
id: TCK-1847
title: "La carte publique lit les bornes de surface en entier, et ne rend plus 500 au-delà de la colonne"
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
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-187--paramètres-des-routes-publiques-sans-compte-face-à-une-valeur-mal-formée"
tags: [back, public, carte, recherche, pistes]
---

## Contexte

Réf : **P187.03** du fichier de pistes, `retenu · autonome` (A1). `FiltresDeLaCarte` comparait
`(float) $p['area_min']` et `area_max` à `properties.area`, un entier (`unsignedInteger`, soit
`integer` sous PostgreSQL). `GET /api/public/properties/map?…&area_min=3000000000` rendait 500
(`22003`), de même `1e20` et `1e400` (`22P02`).

## Hypothèse (mode sans humain)

La `Piste` proposait un `max:2147483647` sur `area_min`/`area_max` de `SearchPublicPropertyRequest`,
dont la carte hérite. Ce plafond ferait rendre 422 à la **liste**, qui rend 200 sur
`area_min=3000000000` aujourd'hui (un 422 neuf sur une URL publique est V7, cf. le classement de
P187.06), et casserait la parité liste/carte de TCK-633. Le correctif retenu lit la borne en entier
dans `FiltresDeLaCarte` seul, et la carte rend le résultat de la liste : rien ne change à la
validation.

## Objectif utilisateur

Un visiteur dont l'URL de carte porte une surface démesurée, infinie ou décimale obtient la carte
(vide ou non), et non une erreur.

## Contrat de données

Aucun changement : `GET /api/public/properties/map`, mêmes paramètres, même validation.

## Contraintes strictes (métier)

- Un minimum s'arrondit à l'entier supérieur, un maximum à l'entier inférieur.
- Un minimum au-delà de 2³¹ − 1 n'admet aucun bien ; un maximum au-delà ne borne rien (il écarte
  toujours les surfaces inconnues, comme toute comparaison numérique).

## Delta à produire

- [x] `FiltresDeLaCarte` : bornes de surface lues en entier, bornées par la colonne.
- [x] Test à jeu de données dans `PropertyMapTest` : sept bornes, 200 attendu, bien présent ou absent.

## Critères d'acceptation

- [x] AC1 — `area_min=3000000000`, `10²⁰`, `1e400` → 200, aucun bien.
- [x] AC2 — `area_max=3000000000`, `1e400` → 200, le bien de 120 m².
- [x] AC3 — `area_min=119.5` → le bien de 120 m² ; `area_max=119.5` → aucun.

## Reste à faire

- Le plafond `max` sur `area_min`/`area_max` de `SearchPublicPropertyRequest` que la `Piste`
  proposait : il ferait rendre 422 à la liste là où elle rend 200 aujourd'hui.

## Notes d'implémentation

- Reproduction : les sept cas rouges avant correctif, 500 `22003` (`3000000000`) et `22P02`
  (`1.0E+20`, `INF`, et `119.5` : la surface **décimale** cassait aussi la carte, ce que le constat
  ne relevait pas).
- Ablation : `FiltresDeLaCarte` ramené à `pre-dev` → sept rouges ; remis → 20/20 dans
  `PropertyMapTest`, 31/31 dans `MapFiltersParityTest`.
