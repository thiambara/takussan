---
id: TCK-701
title: "Après un seed, tous les modèles Searchable sont réindexés (liste dérivée du code)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models: []
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-16--listes-internes-sur-un-modèle-searchable
tags: [api, search, seeders, pistes]
---

## Contexte

Réf : **P16.01** du fichier de pistes, `retenu · autonome` (classement A1 : le docblock de la
constante, « Searchable models that must be (re)pushed », et `takussan-api/CLAUDE.md`, « ne pas
recopier cette liste ailleurs : elle se dérive du code », écrivent déjà le comportement attendu).

`YearOfActivitySeeder` coupe Scout pendant les insertions, puis réindexe une liste écrite à la
main, `SEARCHABLE_MODELS` = `Property`, `Document`, `Message`. `Customer`, `MaintenanceRequest`,
`User` et `Agency` sont `Searchable` depuis TCK-281 et n'y figurent pas : après un
`migrate:fresh --seed`, leurs index restent vides, et `filter[search]` sur les listes de clients,
d'interventions et d'utilisateurs rend une liste vide (mesuré par le mesureur : 2 clients indexés
pour 564 en base).

Reproduit le 2026-10-16 (`39b5fd85`) : `SeedingReindexTest`, moteur Scout espion, rend
`[Document, Message, Property]` contre les sept modèles de `Tests\Support\SearchableModels::all()`.

## Objectif

Un seed réindexe tous les modèles `Searchable`, y compris ceux qui le deviendront.

## Delta à produire

- [x] `App\Support\Search\SearchableModels::all()` : les classes concrètes de `app/Models` qui
      portent `Laravel\Scout\Searchable`, dérivées du code.
- [x] `YearOfActivitySeeder::reindexSearchableModels()` itère sur cette liste ; la constante
      `SEARCHABLE_MODELS` disparaît.
- [x] `tests/Feature/Database/Seeders/SeedingReindexTest.php` : un moteur Scout espion enregistre
      les `flush()` de `removeAllFromSearch()` ; l'ensemble réindexé doit égaler
      `Tests\Support\SearchableModels::all()`.

## Critères d'acceptation

- [x] AC1 — Le seeder réindexe les sept modèles `Searchable` actuels.
- [x] AC2 — Avec une liste écrite à la main, le test rougit.

## Hypothèses (mode sans humain)

- `Tests\Support\SearchableModels` n'est pas réemployé par le seeder : il vit sous l'autoload de
  développement, absent d'une image construite sans dépendances de dev. Il garde sa propre
  dérivation, qui sert d'oracle indépendant au test.

## Hors périmètre

- La seconde moitié de la `Piste` : une garde qui compare, sur un environnement, le nombre de
  documents indexés au nombre de lignes non supprimées. Elle mesure un environnement, pas le code ;
  laissée en reste dans le fichier de pistes.
- `docker/release.sh`, qui dérive déjà sa liste (`modeles_indexes`, `docker/lib.sh`).

## Notes d'implémentation

- Ablation : boucle du seeder remise sur `[Property, Document, Message]` → **rouge**
  (« Failed asserting that two arrays are identical », trois modèles contre sept) ; correctif
  remis → vert.
- Le test a besoin de `RefreshDatabase` : `makeAllSearchable()` interroge chaque table, même vide.
