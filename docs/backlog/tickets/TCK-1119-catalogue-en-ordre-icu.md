---
id: TCK-1119
title: "Étiquettes et quartiers rangés en ordre ICU sur l'API connectée et dans la console, comme sur le site public"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#10-tag"
    - "docs/models-spec.md#91-geoneighborhood-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-87--tris-alphabétiques-sous-la-collation-c"
tags: [back, tags, geo, super-admin, collation, adr-0025, pistes]
---

## Contexte

Réf : **P87.03** du fichier de pistes, `validé (délégué)` (V7 accordé : aligner l'ordre de l'API
connectée et de la console sur celui que `GeoReferentialController` sert déjà au public).

Le référentiel public trie étiquettes et quartiers en `name COLLATE "und-x-icu"`. Les mêmes lignes
sortaient en ordre des octets sur `/api/tags` (défaut compris), sur le `sort=name` de
`Tag::buildQuery()` et de `GeoNeighborhood::buildQuery()` (cibles de fusion de la console), et
dans les quartiers proches d'une proposition.

## Décision du porteur (déléguée)

trier en `COLLATE "und-x-icu"`, comme `GeoReferentialController::TRI`, les étiquettes de `/api/tags` (défaut compris), le `sort=name` de `Tag` et de `GeoNeighborhood` exposé par `buildQuery()` (cibles de fusion de la console) et l'`orderBy('name')` des quartiers proches de `GeoNeighborhoodAdminController` ; test : une étiquette en « É » avant « Z » sur `/api/tags`, un quartier en « Île » avant « Zone » sur `/api/admin/geo/neighborhoods?sort=name`

## Objectif utilisateur

L'agent et l'opérateur de la console lisent les étiquettes et les quartiers dans le même ordre
alphabétique que le site public, initiales accentuées ou en minuscule comprises.

## Delta à produire

- [x] `Tag` : `name` quitte `$requestSortable` ; `Tag::nameSort()` (`CollatedNameSort` sur
      `tags.name`) entre dans `buildQuery()` ; `TagController::index()` le prend en défaut.
- [x] `GeoNeighborhood` : `buildQuery()` déclare `name` par `CollatedNameSort` sur
      `geo_neighborhoods.name`.
- [x] `GeoNeighborhoodAdminController::prochesApprouves()` : `orderByRaw('name COLLATE "und-x-icu"')`.
- [x] Test `tests/Feature/Geo/CatalogueCollatedSortTest.php`.

## Critères d'acceptation

- [x] AC1 — `/api/tags` : « Zinc », « étage », « Étranger », « Balcon » → « Balcon », « étage »,
      « Étranger », « Zinc », au défaut et sur `sort=name` ; l'inverse sur `sort=-name`.
- [x] AC2 — `/api/admin/tags/proposals?sort=name` : même ordre.
- [x] AC3 — `/api/admin/geo/neighborhoods?sort=name` : « Almadies », « Île Nord », « Zone B ».
- [x] AC4 — les quartiers proches d'une proposition sortent dans l'ordre ICU.

## Hors périmètre

- Les autres listes de l'angle 87 (membres, agences, portefeuilles), traitées par leurs entrées.
- Aucun index : ADR-0025 n'en pose que sur `EXPLAIN`.
- Aucun changement du front.

## Notes d'implémentation

- Ablation : les quatre fichiers de `app/` rendus à `HEAD` → 4 rouges sur 4 ; correctif remis → 4/4.
- Le cas des quartiers proches exige deux noms de même clé repliée qui s'ordonnent autrement en
  `C` et en ICU, alors que l'index `geo_neighborhoods_city_name_ci_unique` refuse deux noms qui ne
  diffèrent que par la casse : « Ile-Nord » et « ile nord » (le tiret est un séparateur de la clé,
  et ICU range l'espace avant le tiret).
