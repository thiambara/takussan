---
id: TCK-2747
title: "Accepter une candidature sur un logement déjà loué : la refuser, sauf relocation après la fin du bail (décision du porteur)"
status: todo
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2734]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, candidature, decision-porteur]
---

## Objectif utilisateur

L'agent qui accepte une candidature ne promet pas au client un logement qu'un locataire occupe encore, sauf quand le
bail en cours se termine avant l'entrée demandée.

## Contexte

Mesuré en démo (lecture seule) le 2026-11-12, pendant la seconde porte de TCK-2734 : sur 20 candidatures acceptées,
10 sont sur un bien qui a un bail, et **9 de ces 10 ont été acceptées APRÈS que le bail existait déjà**. Ce sont des
données de seed : l'API n'a jamais servi en production. Mais rien ne refuse ce geste dans le code :

- `BookingService::confirm()` ne juge que les nuits (`assertAvailable`, séjours seulement, ADR-0102 § 3) et la règle
  « une seule candidature acceptée » (TCK-2734).
- La seconde porte de TCK-2734 ferme les candidatures ouvertes **à la création** du bail. Une candidature déposée et
  acceptée APRÈS reste `confirmed` sur un bien loué.

## Décision à prendre (porteur)

- **(a) — recommandé.** Refuser la confirmation d'une candidature (`kind = application`) sur un bien qui porte un bail
  actif (`active`, ou à venir : `draft`, `pending_signature`), **sauf si ce bail se termine avant le début demandé**
  (`end_date` du bail < `start_date` de la candidature) : la relocation anticipée reste possible. Code
  `409 booking.property_already_leased`, jugé sous le verrou du bien que `confirm()` pose déjà.
- **(b)** Avertir sans refuser : la confirmation passe, le dialogue de l'agent signale le bail en cours.
- **(c) Statu quo.**

Les offres d'achat et les séjours ne sont pas concernés.

## Delta à produire (option a)

- [ ] `BookingService::confirm()` : la règle ci-dessus, sous le verrou du bien
- [ ] Le message du code : la prose localisée de l'API, rendue par `useMessageErreurApi` (pratique de TCK-2734)
- [ ] Le seeder ne fabrique plus de candidature acceptée sur un bien loué (sinon la démo contredit la règle)
- [ ] Tests : bail actif → 409 ; bail qui finit avant le début demandé → confirmée ; bail résilié ou expiré → confirmée ;
      offre et séjour non soumis

## Critères d'acceptation (option a)

- [ ] AC1 — La prémisse est éprouvée avant le correctif : le test du bail actif, joué sur le code d'avant, est vert
      pour la confirmation (elle passe)
- [ ] AC2 — Bail actif, ou à venir, couvrant le début demandé → 409 `booking.property_already_leased`, la candidature
      reste `pending`
- [ ] AC3 — Bail qui se termine avant le début demandé → la candidature se confirme
- [ ] AC4 — Ablation : retirer la règle rougit AC2 et pas AC3

## Hors périmètre

- Le rattrapage des données existantes : il n'y en a pas en production (décision du 2026-11-12)

## Notes d'implémentation

**Décision du porteur (2026-11-12, soir) : option (a)** — décision 6, relayée par team-lead.

- **La règle** : `BookingService::confirm()` appelle `assertPropertyNotLeased()` après la règle de TCK-2734, sous le
  verrou du bien déjà posé. La requête est `BookingService::bauxQuiOccupent($booking)`, publique parce que le seeder la
  reprend. Elle retient les baux du bien en `draft`, `pending_signature`, `active` ou `terminating` qui couvrent le début
  demandé, c'est-à-dire dont la fin est absente ou ≥ ce début. Pour un bail `terminating`, la fin est la date d'effet du
  préavis (`early_termination_effective_date`) quand elle existe : une entrée le lendemain de cette date se confirme.
  Une candidature sans date de début est refusée dès qu'un bail occupe le bien, car elle ne prouve aucune entrée après
  la fin. Le code rendu est `409 booking.property_already_leased`, avec sa prose en fr/en/wo dans `lang/*/errors.php`
  (wo = fr). Le front n'a pas de clé neuve : `useMessageErreurApi` rend la prose.
- **Le bail du candidat ne le refuse pas** (`tenant_id` = son client). Depuis la décision 7 (TCK-2734), sa candidature
  reste ouverte pendant le brouillon tiré d'elle, et l'agent peut encore l'accepter. Un bail sans locataire compte comme
  celui d'un autre.
- **Seeder** : `LeaseSeeder::fermerLesCandidaturesSurUnBienLoue()` est appelé à la fin de `run()`. Les réservations sont
  semées avant les baux, et `BookingSeeder` n'appelle pas `confirm()`. L'étape passe donc en `rejected` les candidatures
  acceptées que la règle de l'API aurait refusées, par la même requête, en datant `cancelled_at` et `updated_at` de leur
  acceptation (`withoutEvents`). Le compte sur le jeu entier n'a pas été mesuré en local : les seeders se jouent en CI.
- **Limite à connaître** : un brouillon abandonné bloque la confirmation des candidatures du bien tant qu'il existe.
  Aucune route ne supprime un bail, et `terminate` refuse un brouillon. Pour l'instant, la seule sortie est de le mener
  à son terme. Le porteur n'a pas eu à trancher ce cas ; il est remonté à team-lead.

**Tests** — `tests/Feature/Api/CandidatureSurUnBienDejaLoueTest.php` (12 ; `LangGroupParityTest` vert pour le code neuf). AC1 a été éprouvé avant la règle : 6 rouges
« Expected 409 but received 200 », 3 verts (les témoins).

**Ablations** (une à la fois, md5 du mutant vérifié avant restauration, relevés dans le scratchpad du lot 2,
`back4/abl/`) :
- **a5 — règle retirée de `confirm()` (AC4)** : 6 rouges, tous des cas AC2 (bail actif, à venir ou en préavis, sans
  fin, jour de fin couvert, date d'effet du préavis couverte, verrou). 6 verts, dont les deux AC3 (relocation après la
  fin, entrée le lendemain de l'effet du préavis), séparés de leur refus pour que l'ablation les juge seuls.
- **a6 — exclusion du bail du candidat retirée** : 2 rouges (bail du candidat, jeu de démo).
- **a7 — date d'effet du préavis ignorée** : 1 rouge (préavis).
- **a8 — étape du seeder sans la règle de l'API** (tout bail du bien ferme) : 1 rouge (jeu de démo).

### Réserve r1 de la vérification de d87e423e7 (2026-11-13)

- `FilterCoverageSeeder` et `EdgeCaseSeeder` sèment des baux actifs (`LS-FC-*`, `LS-EC-*`) après `LeaseSeeder`. Leurs baux échappaient à la clôture des candidatures acceptées.
- La clôture se rejoue maintenant après eux : `Database\Seeders\Support\ClotureDesCandidaturesSeeder`, placé dans `YearOfActivitySeeder::PIPELINE` après `EdgeCaseSeeder` et avant `PropertyMediaSeeder`. Elle applique la règle de `LeaseSeeder::fermerLesCandidaturesSurUnBienLoue()`, sans en faire une copie.
- La clôture de `LeaseSeeder` reste en place : elle ferme le jeu réaliste avant que ses paiements ne soient semés.
- Épinglé par `CandidatureSurUnBienDejaLoueTest::test_la_cloture_du_jeu_de_demo_se_rejoue_apres_les_fixtures`, qui vérifie l'ordre du pipeline et l'effet de la passe. Deux ablations, toutes deux rouges :
  - la passe placée avant `EdgeCaseSeeder` ;
  - la passe vidée.
- **Reste connu** : `BookingPaymentSeeder` passe avant les fixtures. Une candidature fermée par la passe finale garde donc les paiements semés quand elle était acceptée : la clôture du seeder ne change que le statut, sans tâche de remboursement.
- Les tests de seed voisins sont verts : `SeedingFeatureTables`, `SeedingInvariants`, `SeedingJourney`, `SeedingTextAndDeterminism`, `FilterCoverageTags`.
