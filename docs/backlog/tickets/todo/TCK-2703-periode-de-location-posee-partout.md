---
id: TCK-2703
title: "Une location porte toujours sa période : seeders alignés sur l'invariant du modèle, et les biens `rent` sans `rent_period` rattrapés"
status: todo
phase: P1
family: back
estimate: S
wave: 87
created: 2026-11-11
updated: 2026-11-11
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md"
tags: [back, donnees, seeders, migration, occupation, audit-ux, app]
---

## Objectif utilisateur

Le bailleur de démonstration lit « 100 % · 2 sur 2 » à côté de « 54 disponibles ». Pourtant, ses biens en location sont mensuels. L'occupation, les filtres « au mois » de la recherche et de la carte doivent compter **tous** les biens en location longue durée, et non les seuls qui portent `rent_period` en toutes lettres.

## Contrat de données

Relevé le 2026-11-11 sur la base de démonstration, pendant TCK-2626 :

- **381 biens `contract_type = rent` sur 451 ont `rent_period` NULL** : 149 du catalogue (`PR-`), 216 de la couverture des filtres (`PR-FC-`) et 16 des cas limites (`PR-EC-`).
- Le bailleur `owner1@dakarimmo.sn` a 55 de ses 57 biens en location dans ce cas.
- **L'invariant existe dans le modèle** : `Property::saving` pose `monthly` sur un bien `rent` sans période (`app/Models/Property.php:178-183`).
- **Il est contourné par les seeders** : `PropertySeeder`, `FilterCoverageSeeder` et `EdgeCaseSeeder` créent les biens sous `Property::withoutEvents()`. Les 70 biens `PR-` qui portent `monthly` l'ont reçu d'une sauvegarde ultérieure, par le modèle.
- **NULL n'a pas de sens métier distinct de `monthly`**. Toutes les lectures qui distinguent NULL le traitent comme un mois :
  - `RepartitionDesPrix` : « implicite (`rent_period` nul) ou déclaré (`monthly`) » ;
  - `RadarTargetMatcher:244` ;
  - le front : `rent_period ?? 'monthly'` dans la fiche, l'aperçu et la matrice des champs ;
  - le commentaire de `PropertySeeder` (TCK-598) : « une location sans période EST mensuelle ».
- **Effet** : NULL est exclu de l'éligibilité de l'occupation (`PortfolioMetrics::eligibleSql`, `rent_period IN (monthly, yearly)`), du filtre `rent_period = monthly` de la carte (`FiltresDeLaCarte`) et de la recherche (`PropertySearchService`).

## Contraintes strictes (métier)

- **Une seule règle** : la période par défaut d'une location est celle de `Property::saving`. Les seeders la reprennent, ils ne la recopient pas.
- **Le rattrapage ne touche que `contract_type = rent` et `rent_period` NULL.** Une vente garde NULL, et une période déclarée n'est pas réécrite. `updated_at` n'est pas modifié : c'est une réparation de données, pas une édition.
- **Le retour est irréversible**, et c'est dit : après le rattrapage, rien ne distingue un `monthly` rattrapé d'un `monthly` saisi. `down()` ne fait rien et ne lève pas, car le job `migrations-pgsql` rejoue les `down()` récents.
- **Le jeu semé est jugé** : `ReferentialIntegrityChecker` nomme un bien en location sans période.

## Delta à produire

- [ ] `Property` : la règle de `saving` exposée, et lue aussi par les seeders.
- [ ] `PropertySeeder`, `FilterCoverageSeeder`, `EdgeCaseSeeder` : la période posée par cette règle.
- [ ] `ReferentialIntegrityChecker` : invariant `bien_en_location_sans_periode`.
- [ ] Migration de données `2026_11_11_11xxxx` : rattrapage idempotent.
- [ ] Tests :
  - la migration (rattrape `rent` NULL ; laisse la vente, une période déclarée et `updated_at` ; se rejoue sans effet) ;
  - les seeders (aucun bien en location sans période, cas limites et couverture compris) ;
  - le vérificateur nomme la violation.

## Critères d'acceptation

- [ ] AC1 — Après la migration, aucun bien `rent` n'a `rent_period` NULL. Une vente reste NULL, un `daily` reste `daily`, et `updated_at` est inchangé. Une seconde passe ne change rien.
- [ ] AC2 — Le mini-pipeline de seeders (catalogue, couverture des filtres, cas limites) ne produit aucun bien `rent` sans période.
- [ ] AC3 — Ablation : sans la période dans `PropertySeeder`, AC2 et l'invariant rougissent.

## Hors périmètre

- Rendre `rent_period` NOT NULL pour les locations (contrainte CHECK) : une décision de schéma, qui demanderait un ADR.
- Réindexer Meilisearch : à faire **après** la migration sur chaque environnement (`php artisan scout:import "App\Models\Property"`), puisque la migration écrit hors du modèle.

## Notes d'implémentation

**Re-mesure avant correctif** (base de démo, 2026-11-11 01:59 UTC), par origine du bien :

| origine | `rent` sans période | `rent` `monthly` | `sale` (NULL) |
|---|---|---|---|
| catalogue `PR-` | 149 | 70 | 107 |
| couverture des filtres `PR-FC-` | 216 | 0 | 20 |
| cas limites `PR-EC-` | 16 | 0 | 4 |

**Sens métier de NULL : aucun distinct de `monthly`.** C'est vérifié avant d'écrire la migration :

- `RepartitionDesPrix` le lit comme « au mois implicite » ;
- `RadarTargetMatcher:244` le lit comme mensuel ;
- le front l'écrit `rent_period ?? 'monthly'` dans la fiche, le récapitulatif de visite, l'aperçu du formulaire et `field-matrix` ;
- le commentaire TCK-598 de `PropertySeeder` dit « une location sans période EST mensuelle ».

Aucune lecture ne donne à NULL un autre sens.

**Ce qui est fait**

- `Property::avecPeriodeParDefaut(array)` est la règle unique. Le crochet `saving` la lit, sous sa garde d'origine : il ne lit `rent_period` que pour une location, donc un modèle chargé sans la colonne n'est pas réécrit à NULL. Les trois seeders qui écrivent sous `withoutEvents()` l'appliquent au tableau final, après `array_merge` des surcharges, si bien qu'une surcharge en vente reste sans période.
- Invariant `bien_en_location_sans_periode` dans `ReferentialIntegrityChecker`. Le jeu réaliste le tient, et `SeedingInvariantsTest` passe.
- Migration `2026_11_11_110000_backfill_rent_period_of_rentals` : une requête `UPDATE`, idempotente, sans toucher `updated_at`. Les biens supprimés sont compris. `down()` vide et documenté : le rattrapage est irréversible, rien ne distingue après coup un `monthly` rattrapé.
- **Déjà jouée sur la base de démo** : un `php artisan migrate` lancé par une autre voie l'a prise (batch 6). Mesuré à 02:15 UTC : 0 location sans période. `owner1` passe à **57 éligibles, 10 occupés, 17,54 %** ; il était à 2 sur 2 (100 %).
- **Reste à faire hors du code** : l'index Meilisearch garde `rent_period: null` pour ces biens tant qu'il n'est pas reconstruit (`php artisan scout:import "App\Models\Property"`). Je ne l'ai pas lancé : c'est une écriture sur le service partagé.

**Tests** :

- `BackfillRentPeriodMigrationTest` couvre : rattrapage, vente, `daily`/`yearly` intacts, supprimé rattrapé, `updated_at` inchangé, rejeu sans effet, `down()` sans effet.
- `RentPeriodSeededTest` contient deux tests :
  - le mini-pipeline (catalogue, couverture, cas limites) ne laisse aucune location sans période et les ventes gardent NULL ;
  - le vérificateur nomme la violation.

Ablations E1 à E9, toutes rouges puis restaurées (md5) : chaque seeder (E1 à E4, E1 étant AC3), la règle, le filtre de la migration (E6, E7), l'invariant, la vente.

Voisins : 165 tests verts (invariants du jeu semé, couverture des filtres, biens, recherche, carte, répartition des prix, tableau de bord du bailleur).
