---
id: TCK-1128
title: "Un quartier renommé par le jeu du référentiel garde son ancien nom, comme un renommage de la console"
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
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#91-geoneighborhood-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-99--critères-de-ville-et-de-région-rangés-par-nom-face-au-chargeur-du-référentiel"
tags: [back, geo, recherche, referentiel, pistes]
---

## Contexte

Réf : **P99.02** du fichier de pistes, `validé (délégué)` (V7 accordé : étendre au jeu du
référentiel la règle que le porteur a écrite pour la console, TCK-1080, et pour la fusion,
TCK-1052 : un ancien nom désigne toujours le quartier).

`GeoReferentialLoader::quartier()` remplaçait le nom d'un quartier que la console n'a pas renommé,
sans ranger l'ancien dans `former_names` : `location=<ancien nom>` ne trouvait plus le bien.

## Décision du porteur (déléguée)

dans `GeoReferentialLoader::quartier()`, quand le jeu change le nom d'un quartier, ajouter l'ancien nom à `former_names` sans doublon, comme `renommer()`, sans écrire `renamed_at` (le jeu doit pouvoir le renommer encore) ; test dans `GeoReferentialRealignementTest` : quartier renommé par le jeu, puis `location=<ancien nom>` → le bien

## Objectif utilisateur

Une recherche ou une alerte sauvegardée sur le nom d'avant d'un quartier que l'amont a renommé
continue de trouver ses biens.

## Delta à produire

- [x] `GeoReferentialLoader::quartier()` : quand le nom change, l'ancien s'ajoute à
      `former_names`, sans doublon ; `renamed_at` n'est pas écrit.
- [x] Cas neuf de `tests/Feature/Geo/GeoReferentialRealignementTest.php`.

## Critères d'acceptation

- [x] AC1 — jeu rejoué deux fois avec « Point E » renommé « Point E Amitié » → `former_names` =
      `["Point E"]`, `renamed_at` nul, `location=Point E` et `location=Point E Amitié` → le bien.
- [x] AC2 — renommé encore puis rendu à « Point E Amitié » → chaque nom retiré s'ajoute une fois,
      et `location=Point E` trouve toujours le bien.

## Hors périmètre

- La région renommée par le jeu (P99.03, à valider : V4) et les villes.
- Le nom courant qui figure aussi dans `former_names` après un aller-retour : même comportement
  que `renommer()`, sans effet sur le filtre, qui compte les deux comme des noms du quartier.

## Notes d'implémentation

- Ablation : `GeoReferentialLoader.php` remis à `0d52a71ee` → le cas neuf rougit (`former_names`
  nul, première assertion), les 4 autres restent verts ; correctif remis → 5/5. Le constat de la
  recherche (`location=Point E` → 0 sans le correctif) est celui que le mesureur a relevé.
