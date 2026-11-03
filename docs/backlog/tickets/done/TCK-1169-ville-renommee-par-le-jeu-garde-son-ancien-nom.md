---
id: TCK-1169
title: "Une ville renommée par le jeu garde son ancien nom pour les alertes et le rapprochement CRM"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1167]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-99--critères-de-ville-et-de-région-rangés-par-nom-face-au-chargeur-du-référentiel"
tags: [back, geo, search, crm, migration, pistes]
---

## Contexte

Réf : **P99.01** du fichier de pistes (🟠), `validé` (le dernier classement cite V4 et V7).

Le chargeur du référentiel renomme une ville et réécrit `addresses.city` au nouveau nom
(TCK-787), sans garder l'ancien nulle part. Les filtres `city` et `cities` (recherche, alertes)
et le rapprochement CRM comparent des textes : une alerte ou un prospect rangés sous l'ancien
nom ne trouvaient plus rien, sans erreur. Les quartiers gardent leurs anciens noms
(`former_names`, TCK-1080, TCK-1128).

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste n'offre qu'une voie, celle de TCK-1080 appliquée aux
villes : `geo_cities.former_names` écrit par `ville()` quand le nom change, et lu par
`buildFilter()` (`city`, `cities`) et `ProspectMatcher`. La correspondance d'un ancien nom se fait
par la clé `CleDeQuartier`, comme pour les quartiers et pour les villes du CRM (TCK-1167).

## Delta à produire

- [x] Migration additive `2026_10_21_224500_add_former_names_to_geo_cities` (`jsonb` nullable,
      `down()` qui retire la colonne) ; cast `array` sur `GeoCity`.
- [x] `GeoReferentialLoader::ville()` ajoute l'ancien nom à `former_names`, sans doublon.
- [x] `App\Services\Search\VilleDuFiltre` : `nomsActuels(saisie)` (les villes dont un ancien nom
      a la clé de la saisie) et `clesAnciennes(villeId)`.
- [x] `PropertySearchService::buildFilter()` : `city` et chaque terme de `cities` élargis aux noms
      actuels ; `city` garde sa forme d'une clause quand rien ne s'ajoute.
- [x] `ProspectMatcher` : `propertiesFor()` accepte les adresses au nom actuel ;
      `customersFor()` accepte les prospects qui portent un ancien nom de la ville du bien.
- [x] Test `test_une_ville_renommee_par_le_jeu_repond_encore_a_son_ancien_nom`.

## Critères d'acceptation

- [x] AC1 — jeu v1, bien à « Guédiawaye » d'une agence, prospect `["Guédiawaye"]` ; jeu rejoué
      deux fois avec la ville nommée « Guédiawaye Ville » : `alertMatches` rend le bien pour
      `city = Guédiawaye`, `cities = [Guédiawaye]` et `city = Guédiawaye Ville` ;
      `propertiesFor` et `customersFor` se trouvent l'un l'autre ; `former_names` vaut
      `["Guédiawaye"]`.
- [x] AC2 — les tests de TCK-787 restent verts : l'index ne porte que le nouveau nom.

## Hors périmètre

- Les filtres SQL de la carte et des listes d'agence ne lisent pas les anciens noms de ville : la
  piste ne vise que `buildFilter()` et le rapprochement.
- La console ne renomme pas les villes : seul le jeu écrit `former_names`.
- `docs/models-spec.md` ne décrit pas plus `geo_cities.former_names` que
  `geo_neighborhoods.former_names` (TCK-1080) : à reprendre par `/sync-specs`.

## Notes d'implémentation

- Ablation : écriture de `former_names` retirée de `ville()` → le test rougit sur l'alerte
  `city = Guédiawaye` (`[]`) ; remis → 9/9 dans la classe. Classes voisines vertes :
  `ProspectMatcherTest` 7, `SendProspectMatchDigestTest` 6, `SavedSearchAlertsTest` 25,
  `SearchMinimumFiltersTest` 5, `GeoReferentialSeederTest` 11, `GeoPublicEndpointsTest` 9.
- La correspondance passe par la clé repliée : une saisie « Guediawaye » désigne aussi la ville
  renommée.
