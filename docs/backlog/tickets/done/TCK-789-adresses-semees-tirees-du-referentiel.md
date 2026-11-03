---
id: TCK-789
title: "Les adresses semées tirent leurs quartiers et leurs coordonnées du référentiel géographique"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-17--qualité-des-adresses--référentiel-ou-texte-libre"
tags: [back, geo, seed, pistes]
---

## Contexte

Réf : **P17.04** du fichier de pistes, `validé` (critère accordé : V4, le correctif change les
données que les seeders écrivent). Le jeu de démonstration écrit des adresses que le référentiel
d'ADR-0062 ne peut pas rattacher :

- `FilterCoverageSeeder` combine un quartier de Dakar, une ville tirée au hasard, la région
  `Dakar` et des coordonnées dakaroises (« Fann » à Kaolack) ;
- `PropertySeeder` place les biens hors de Dakar n'importe où dans le cadre du pays (jusqu'à
  plusieurs centaines de km de leur ville) ;
- les quartiers du faker ne portent pas les noms du jeu (« Plateau », « Grand-Yoff »,
  « Dieuppeul », « Hann Maristes ») ou sont des villes (« Pikine », « Guédiawaye ») ;
- `GeoReferentialSeeder` tourne après tous ces seeders : ils ne peuvent rien y tirer.

Les comptes de quartiers « hors référentiel » mesurés sur une base de dev décrivent donc le seed,
pas le produit (voir P01.02).

## Décision du porteur

quartiers seedés tirés de geo_neighborhoods de la ville, coordonnées autour de son centre ; garde : toute adresse seedée avec un quartier est rattachée

## Delta à produire

- [x] `GeoReferentialSeeder` passe en tête du pipeline de `YearOfActivitySeeder`, avant les
      seeders qui écrivent des adresses.
- [x] `Database\Seeders\Support\SeedGeo` : la ville du référentiel par son nom, ses quartiers
      approuvés, et des coordonnées autour de son centre (repli sur le cadre de l'appelant sans
      référentiel).
- [x] `PropertySeeder` : à Dakar, quartier tiré parmi les quartiers du référentiel qui ont une
      grille de prix ; coordonnées autour du centre de la ville choisie.
- [x] `FilterCoverageSeeder` : quartier tiré dans la ville tirée (aucun si elle n'en a pas),
      région de cette ville, coordonnées autour de son centre.
- [x] `SenegalFakerProvider` : noms de quartiers alignés sur le jeu ; « Pikine », « Guédiawaye »
      et « Cité Keur Gorgui » (absent du jeu) retirés des quartiers de Dakar.
- [x] Garde : `tests/Feature/Seeders/SeededAddressesAttachedTest.php`.

## Critères d'acceptation

- [x] AC1 — Le référentiel est chargé avant `PropertySeeder` et `FilterCoverageSeeder`.
- [x] AC2 — Toute adresse de bien semée avec un texte de quartier est rattachée à un quartier
      de sa propre ville.
- [x] AC3 — Toute adresse de bien semée est placée à moins de 10 km du centre de sa ville.

## Hors périmètre

- `SavedSearchSeeder` (critère `location` d'une recherche enregistrée, pas une adresse) : seuls
  les noms du faker qu'il lit changent.
- Les adresses des autres seeders (`EdgeCaseSeeder` écrit « Almadies » à Dakar, déjà rattaché).
- Le filtre texte des quartiers hors référentiel de la recherche (P01.02).

## Hypothèses (mode sans humain)

- « Autour de son centre » : ±0,04° en latitude et en longitude, soit moins de 7 km du centre
  donné par le jeu. La garde tolère 10 km.
- Les quartiers de Dakar restent pondérés par la grille de prix du faker : seuls ceux que le
  référentiel connaît sont tirés, pour garder des prix vraisemblables par quartier.

## Notes d'implémentation

- Reproduction avant correctif : la garde rouge sur les trois points, 200 adresses loin de leur
  ville (Ziguinchor à 271 km, Louga à 167 km) et plus de 26 quartiers non rattachés
  (« Plateau (Dakar) », « Fann (Mbour) »…).
- Ablation : les trois fichiers de seed remis à `pre-dev` (pipeline corrigé gardé) → AC2 rouge ;
  l'ordre du pipeline remis seul → AC1 rouge ; remis → 2 verts.
- Le seed du mini-pipeline, référentiel compris, prend près d'une minute : la garde le joue une
  seule fois et y vérifie AC2 et AC3.
