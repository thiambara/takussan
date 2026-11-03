---
id: TCK-663
title: "Recherche : le quartier proposé par le panneau trouve les biens de ce quartier"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#4-address
    - docs/models-spec.md#91-geoneighborhood-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-1--recherche-dun-bien
tags: [back, search, geo, map, pistes]
---

## Objectif utilisateur

Un visiteur qui choisit « Grand Yoff » dans le panneau de recherche voit les biens de Grand Yoff,
que leur adresse ait été saisie « Grand-Yoff », « grand yoff » ou rattachée au référentiel.

## Décision du porteur

validé — filtrer par geo_neighborhood_id quand il est posé, sinon par le nom normalisé sans accent ni tiret ; adresses non réécrites

## Contrat de données

Réf : **P01.02** du fichier de pistes. Aucun endpoint neuf, aucune migration.

- `GET /api/public/properties/search?location=…` (Meilisearch, `PropertySearchService::buildFilter()`)
  et `GET /api/public/properties/map?location=…` (PostgreSQL, `FiltresDeLaCarte`) appliquent la
  même règle, comme l'exige `MapFiltersParityTest`.
- Le document indexé d'un bien gagne deux champs filtrables : `geo_neighborhood_id` (celui de son
  adresse) et `neighborhood_key` (le texte de son quartier, replié). `neighborhood` est inchangé.

## Contraintes strictes (métier)

- Une adresse qui porte `geo_neighborhood_id` se juge **par cet identifiant**, jamais par son texte :
  elle répond à `location=X` si et seulement si son quartier du référentiel a le même nom replié
  que `X`.
- Une adresse sans identifiant se juge par son texte replié : minuscules, sans accent, tout ce qui
  n'est ni lettre ni chiffre ramené à une espace (`App\Support\Search\CleDeQuartier`).
- Aucune adresse n'est réécrite (pas de migration de données, pas de commande).

## Delta à produire

- [x] `App\Support\Search\CleDeQuartier::de()` — la clé de comparaison, en PHP.
- [x] `App\Services\Search\QuartierDuFiltre` — les identifiants du référentiel qui ont la clé
      cherchée, et (pour la carte) les textes d'adresses non rattachées qui l'ont.
- [x] `Property::toSearchableArray()` : `geo_neighborhood_id`, `neighborhood_key` ;
      `config/scout.php` : les deux en `filterableAttributes`.
- [x] `PropertySearchService::buildFilter()` et `FiltresDeLaCarte::appliquer()` : la clause `location`.
- [x] `tests/Feature/Search/QuartierDuPanneauTest.php` : liste et carte, deux cas.

## Critères d'acceptation

- [x] AC1 — `location=Grand Yoff` rend le bien d'une adresse non rattachée « Grand-Yoff », en liste
      et en carte ; `location=Guediawaye` et `GUÉDIAWAYE` rendent celui de « Guédiawaye ».
- [x] AC2 — une adresse rattachée au quartier « Sacré-Cœur 3 » dont le texte est resté « Ancien nom »
      répond à `location=Sacré-Cœur 3` et à `sacre coeur 3`, et pas à `location=Ancien nom`.
- [x] AC3 — un témoin d'un autre quartier n'est jamais rendu.

## Hors périmètre

- Rattacher les adresses existantes au référentiel (le reste de la piste, V4 : écarté par la décision).
- La facette `locations` et les suggestions (`SuggestService`), qui comptent encore par texte brut.
- Le filtre `city`, qui reste une égalité repliée sur la casse seule.

## Notes d'implémentation

- Hypothèses (mode sans humain) :
  - « le nom normalisé sans accent ni tiret » replie aussi l'apostrophe et les espaces répétées
    (« Patte d'Oie » = « Patte-d-Oie ») ; la casse est repliée comme partout ailleurs.
  - Les identifiants retenus sont ceux de **tous** les quartiers du référentiel de ce nom replié,
    quelle que soit leur ville : `city`, quand il est posé, borne déjà le résultat.
  - Le repli des accents se fait en PHP et ne vaut que pour ce filtre : il ne touche ni la
    collation, ni les contraintes d'unicité d'ADR-0025, ni le résolveur d'ADR-0062 § 1.
- Réindexation : `CleDeQuartier` vit sous `app/Support/Search`, et `config/scout.php` comme
  `Property.php` entrent dans l'empreinte `.search-shape` ; `docker/release.sh` réimporte donc
  les biens au déploiement. Avant cette réimportation, un document sans `neighborhood_key` ne
  répond à aucun `location`.
- La carte ne peut pas replier les accents en SQL (pas d'`unaccent`) : `QuartierDuFiltre::textesLibres()`
  lit les textes distincts des adresses non rattachées et les replie en PHP, à chaque requête qui
  pose `location`. À mesurer si le nombre d'adresses non rattachées croît.
- Ablation, chaque morceau retiré seul puis remis :
  - clause de `buildFilter()` ramenée à `neighborhood = …` → les deux tests rouges sur « la liste » ;
  - `FiltresDeLaCarte` ramené à `adresseEgale('neighborhood', …)` → les deux rouges sur « la carte » ;
  - `idsDuReferentiel()` qui rend `[]` → AC2 rouge (`[5]` au lieu de `[4, 5]`) ;
  - correctif remis → 2 verts, 28 assertions.
