---
id: TCK-787
title: "Rejouer le référentiel géographique réaligne le texte des adresses et rattache les quartiers apparus"
status: done
phase: P2
family: applicatif
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
tags: [back, geo, recherche, pistes]
---

## Contexte

Réf : **P17.03** du fichier de pistes, `validé` (critère accordé : V4, le correctif réécrit des
données existantes à chaque chargement). ADR-0062 § 4 : « Renommer ou fusionner un quartier
réécrit le texte des adresses… et réindexe ». La modération le fait
(`GeoNeighborhoodModeration::reecrireAdresses`) ; `geo:sync-referential`, joué à chaque
déploiement, non :

- `GeoReferentialLoader` renomme une ville ou un quartier du jeu par un simple `save()`, sans
  toucher `addresses.city` / `addresses.neighborhood` ni réindexer les biens ;
- `GeoAddressAttacher` ne relit que les adresses sans ville (`whereNull('geo_city_id')`) : une
  adresse rattachée à sa ville, dont le quartier n'existait pas au premier chargement, n'est
  jamais rattachée quand une version du jeu l'ajoute.

## Décision du porteur

quand le chargeur renomme, réécrire le texte des adresses et réindexer ; le rattacheur traite aussi les adresses qui ont une ville et pas de quartier

## Delta à produire

- [x] Chargeur : un quartier dont le nom change (jeu, ou proposition que le jeu approuve sous sa
      graphie) réécrit `neighborhood` sur ses adresses ; une ville dont le nom change réécrit
      `city` sur les siennes ; les biens concernés sont rendus à `GeoReferentialSync`.
- [x] Rattacheur : les adresses `geo_city_id` non nul, `geo_neighborhood_id` nul et texte de
      quartier non vide sont rapportées au référentiel de leur ville, **sans rien proposer**.
- [x] `GeoReferentialSync` réindexe les biens des deux listes, après les transactions.

## Critères d'acceptation

- [x] AC1 — Le jeu renomme un quartier : l'adresse rattachée garde son quartier, prend le
      nouveau nom, et le bien se trouve sous le nouveau nom et plus sous l'ancien.
- [x] AC2 — Le jeu renomme une ville : l'adresse rattachée garde sa ville et son quartier, prend
      le nouveau nom de ville, et le bien se trouve sous le nouveau nom.
- [x] AC3 — Une version du jeu ajoute un quartier que nomme déjà une adresse rattachée à sa
      ville : l'adresse s'y rattache, et le bien se trouve sous son identifiant.
- [x] AC4 — Chaque cas, rejoué une seconde fois, ne change plus rien ; un texte de quartier
      inconnu ne crée aucune proposition.

## Hors périmètre

- Le renommage d'une région (le jeu les retrouve par code) : la piste ne le cite pas.
- Le repli des tirets et des accents (P17.02).

## Hypothèses (mode sans humain)

- Le texte de ville se réécrit par une mise à jour SQL et non par `save()` : le crochet
  d'`Address` (règle 1 de `GeoAddressCanonicalizer`) prendrait une ville en texte modifiée pour
  une saisie, la re-rapprocherait par son nom et ferait tomber le quartier. La valeur écrite est
  celle que la règle 5 écrirait.
- Un renommage de modération (`renamed_at`) n'est pas un renommage du chargeur : il est déjà
  réaligné par la modération, et le chargeur ne touche pas son nom.

## Notes d'implémentation

- Ablation : les deux appels de réécriture du chargeur retirés → les 2 tests de renommage de
  `GeoReferentialRealignementTest` rouges ; le rattacheur remis à `pre-dev` → le test du
  quartier ajouté rouge ; `GeoReferentialSync` remis (sans réindexation des renommés) → les
  2 tests de renommage rouges sur la recherche ; remis → 4 verts, et `tests/Feature/Geo/` vert
  (70 tests).
- Piège : la ville ne se réécrit pas par `save()`. La règle 1 du canoniseur re-rapproche une
  ville en texte modifiée par son nom et remet le quartier à `null` quand il n'est pas fourni.
