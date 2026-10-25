---
id: TCK-2376
title: "Le seed ne fabrique plus rien pour « réparer » : le vérificateur vérifie, et les jeux de cas limites quittent le jeu réaliste"
status: review
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: [TCK-2377]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#25-invoice-"
tags: [api, seed, données, préproduction, argent]
---

## Objectif utilisateur

Quiconque ouvre la préproduction ou une base de dev semée lit sur les tableaux de bord des
encaissements, des baux et des factures **vraisemblables** : aucun chiffre n'y est l'artefact d'un
correctif du seeder.

## Contexte

Audit du seeding du 2026-10-25, sur une base dédiée (`takussan_seed_audit`, `migrate:fresh --seed`
en configuration par défaut, 7 min, charge 1,7-2,1 sur 8 cœurs). Le même seed remplit la
préproduction (cible `seed` du `Dockerfile`, `images.yml`).

- **66 % des loyers encaissés sont fabriqués** : 5 478 M XOF sur 8 341 M viennent des baux que
  `Support/ReferentialIntegrityChecker::createMissingLeaseForProperty()` crée pour tout bien
  `rented` sans bail actif, avec `monthly_rent = property.price`, tous datés `now()->subMonths(2)`.
  `PropertySeeder` tire `rented` sans regarder `contract_type` : **40 biens à vendre** reçoivent un
  bail au loyer moyen de 53,6 M XOF (max 301 M). Encaissements de juillet à septembre ×8.
- **80 réservations `completed` créées il y a 3 jours dont la période n'a pas commencé**
  (`createActivityForCustomer()`, pour que chaque client ait « une activité »).
- **Factures toujours `paid`** : 273 factures `paid` pour un loyer du mois resté `late`
  (`InvoiceSeeder` ne lit pas les paiements).
- `EdgeCaseSeeder` et `FilterCoverageSeeder` s'exécutent dans le même pipeline et posent leurs
  baux, biens et clients de test parmi les données « réalistes ».

Les requêtes de mesure deviennent les assertions du test attendu ci-dessous.

## Contraintes strictes (métier)

- Le vérificateur de fin de pipeline **ne crée, ne modifie ni ne supprime** aucune ligne : il
  constate et **fait échouer** `db:seed` en nommant chaque invariant violé et son compte. *Un
  correctif silencieux déplace le défaut du seeder vers les chiffres.*
- Un bail **de location** (`residential_rent`, `commercial_rent`, `seasonal_rent`) ne porte que sur
  un bien `contract_type = rent`, et son type suit la famille du bien (habitation → résidentiel,
  professionnel → commercial). Un bail `sale` sur un bien à vendre reste légitime (spec `Lease`,
  « accord de location ou de vente ») : c'est le loyer d'un bien à vendre qui n'existe pas.
- Une facture de loyer n'est `paid` que si l'échéance qu'elle facture est `paid`.
- Les cas limites et la couverture des filtres restent disponibles, mais **hors du jeu par
  défaut** : une option explicite (`SEED_EDGE_CASES`, `SEED_FILTER_COVERAGE`), éteinte par défaut
  dans `SeedingConfig::fromEnv()`, `.env.example` et `.env.docker`. Si la préproduction les veut,
  c'est une décision du porteur, écrite dans `docs/infra/hebergement.md`.

## Delta à produire

- [x] `ReferentialIntegrityChecker` : supprimer `createMissingLeaseForProperty`,
      `createMissingPaymentsForLease`, `createActivityForCustomer` et la création de paiements de
      réservation ; le rendre **purement vérificateur** (liste d'invariants → échec bruyant).
- [x] `PropertySeeder` : `rented` ne se tire plus ; le statut `rented` découle des baux actifs
      (et seulement pour `contract_type = rent`) ; un bien à vendre peut être `sold`.
- [x] `LeaseSeeder` : ne tire que des biens `contract_type = rent` publiés, bâtis ; type du bail
      dérivé de la famille du bien ; loyer tiré autour du `price` du bien.
- [x] `InvoiceSeeder` : statut de la facture dérivé de l'échéance du même mois.
- [x] `SeedingConfig` : `includeEdgeCases` et `includeFilterCoverage` à `false` par défaut ;
      `.env.example`, `.env.docker` alignés (`scripts/check-env-parity.mjs` vert).
- [x] Test `tests/Feature/Database/Seeders/SeedingInvariantsTest.php` : seed en
      `SeedingConfig::test()` puis assertions SQL sur les invariants ci-dessous.

## Critères d'acceptation

- [x] AC1 — Après un seed par défaut, **aucun** bail de location sur un bien `contract_type = sale`
      (aujourd'hui 172 sur 584), et aucun bail `residential_rent` sur un bien qui n'est pas une
      habitation (aujourd'hui 243).
- [x] AC2 — Aucun bail dont `monthly_rent` dépasse 3× ou passe sous ⅓ du `price` d'un bien en
      location (aujourd'hui 12 et 123).
- [x] AC3 — Aucune facture `paid` dont l'échéance de loyer du même mois n'est pas `paid`
      (aujourd'hui 273).
- [x] AC4 — Aucune réservation `completed` dont `start_date` est future (aujourd'hui 80).
- [x] AC5 — Le vérificateur ne fait **aucune** écriture : un test injecte une violation (un bail
      sur un bien à vendre) avant lui et constate que `db:seed` **échoue** en nommant l'invariant,
      et que le compte de lignes de `leases` est inchangé. *Un vérificateur qui « répare » ferait
      passer AC1 sans corriger la cause : AC5 l'interdit.*
- [x] AC6 — Avec la configuration par défaut, aucune ligne n'est écrite par `EdgeCaseSeeder` ni
      `FilterCoverageSeeder` ; avec `SEED_EDGE_CASES=true`, elles le sont.
- [x] AC7 — Ablation : chaque assertion de `SeedingInvariantsTest` est rouge quand on restaure le
      code fautif correspondant (noté dans les notes d'implémentation).

## Hors périmètre

- Le seeding par parcours (visite → réservation → bail) : TCK-2377.
- Les tables vides, la croissance, le texte : TCK-2378, TCK-2379, TCK-2380.
- Re-semer la préproduction : action sortante, décidée par le porteur.

## Notes d'implémentation

- **Spec relue avant de coder** : `models-spec.md` §14 admet un `Lease` de **vente**. La contrainte
  « un bien ne porte un bail que si `contract_type = rent` » contredisait la spec ; elle est devenue
  « un bail de LOCATION ne porte que sur un bien en location ». Le type du bail suit la famille du bien
  (`PropertyLabels::famille`) ; le foncier n'en reçoit aucun.
- **Le vérificateur passe AVANT les fixtures** (`YearOfActivitySeeder::PIPELINE`) : `EdgeCaseSeeder`
  et `FilterCoverageSeeder` violent ses invariants exprès (loyer de 301 M XOF, bien loué sans bail).
- **`FilterCoverageSeeder::tagExistingCatalog()` tourne toujours** : il étiquette le catalogue
  réaliste (sans lui, 0 ligne de `taggables`). Seules les fixtures de couverture passent derrière
  `SEED_FILTER_COVERAGE`.
- **`SeedingConfig` liable au conteneur** : `YearOfActivitySeeder` lit une configuration liée avant
  l'environnement — c'est la porte du test, qui sème un jeu réduit par le vrai pipeline.
- **Réservations** : le défaut ne touche que celles de la dernière semaine (1-2 % du tirage) ; le test
  à 25 réservations n'aurait pas rougi à l'ablation. D'où un test dédié à 800 réservations par agence.
- **Ablation (AC7), le 2026-10-25** — chaque fichier rétabli seul à `HEAD`, test rouge à chaque fois :
  `PropertySeeder` → `bien_loue_sans_bail_actif : 24` ; `LeaseSeeder` → `bail_de_location_sur_un_bien_a_vendre : 21`,
  `bail_residentiel_… : 31`, `loyer_hors_de_proportion… : 12` ; `InvoiceSeeder` →
  `facture_payee_sur_une_echeance_non_payee : 47` ; `BookingSeeder` → test des réservations rouge ;
  `SeedingConfig` → 2 tests rouges ; ordre du pipeline → rouge ; ancien vérificateur « réparateur » →
  « Le vérificateur aurait dû faire échouer le seeding ».
- **Seed complet par défaut** (`takussan_seed_audit`, 6 min 27, charge ~1,8/8) : invariants tenus,
  0 bail de location sur bien à vendre, 0 bail résidentiel hors habitation, 0 facture `paid` sur
  échéance impayée (255 `overdue`), 0 réservation terminée avant son début, 0 fixture ; loyer max
  7,8 M XOF (301 M avant).
- ⚠ **Un `.env` local peut rallumer les fixtures** : celui du poste du porteur pose
  `SEED_EDGE_CASES=true` et `SEED_FILTER_COVERAGE=true` (anciens défauts). Le défaut du code ne
  s'applique qu'à une clé absente. La préproduction porte treize `SEED_*` (relevé du 2026-10-20,
  `docs/infra/hebergement.md`) : leur valeur n'est pas relevée ici, et un re-seed de préproduction
  reste une décision du porteur.
