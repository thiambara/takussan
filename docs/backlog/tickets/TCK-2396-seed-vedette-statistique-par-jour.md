---
id: TCK-2396
title: "Le seed tient l'invariant « une statistique par jour pour chaque Vedette » à toute heure"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-27
updated: 2026-10-27
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#94-propertyboostdailystat-"
tags: [api, seed, boost, bug, tck-2379]
---

## Objectif utilisateur

Le porteur peut se fier à la suite et au seed : `SeedingTextAndDeterminismTest` est vert, et une
Vedette semée a une statistique pour chaque jour, quelle que soit l'heure du seed.

## Contexte

Relevé pendant le rituel de fin de branche du lot 0 du socle IA (2026-10-27, suite entière lancée
vers 03:27 UTC). `SeedingTextAndDeterminismTest` échoue sur **3 cas** (`test_aucun_texte_seme_n_est_du_lorem_ipsum`,
`test_la_meme_graine_rejoue_le_meme_jeu_et_une_autre_graine_un_autre`,
`test_les_loyers_passent_par_plusieurs_moyens_de_paiement`), tous sur l'invariant
`vedette_sans_une_statistique_par_jour` de `database/seeders/Support/ReferentialIntegrityChecker.php`
(posé par TCK-2379, élargi par TCK-2382) : **16** violations dans un cas, **3** dans un autre.

**Le défaut n'est pas celui de la branche** : rejoué le même jour sur sa base `7dc1b8e6`
(`origin/dev` + 4 commits de documentation), dans un worktree séparé, il échoue de la même façon.

L'invariant compare les dates de `property_boost_daily_stats` à `CURRENT_DATE` et tolère déjà un
dernier jour manquant (« un seed qui passe minuit »). Hypothèse à vérifier, pas à croire : le défaut
dépend de l'heure ou du jour du seed (fuseau de l'application contre celui de la session
PostgreSQL, Vedette semée dont la période commence ou finit aujourd'hui). Si la CI de `dev` est
verte sur le même arbre à une autre heure, c'est un indice fort.

## Contrat de données

- Tables : `property_boosts` (`kind = featured`, `starts_at`, `ended_at`) et
  `property_boost_daily_stats` (une ligne par Vedette et par jour) — cf. `spec_refs`.
- Aucun endpoint touché.

## Contraintes strictes (métier)

- **Re-mesurer avant de corriger** : reproduire l'échec, nommer la ou les Vedettes en violation
  (période, nombre de lignes, première et dernière date) et la cause. Ne pas corriger « au jugé ».
- **L'invariant ne s'assouplit pas pour faire passer le test.** S'il est faux (il refuse un état que
  l'application produit elle-même), le corriger et dire pourquoi dans son commentaire ; sinon c'est
  le seed qui se corrige.
- Le seed reste **déterministe** à graine égale (`test_la_meme_graine_…`), y compris à minuit.

## Delta à produire

- [ ] Diagnostic écrit dans les notes d'implémentation : les violations relevées, leur cause, et
      l'heure (UTC et fuseau de l'application) à laquelle elles apparaissent.
- [ ] Correctif dans le seeder des Vedettes (`database/seeders/`) **ou** dans l'invariant, selon le
      diagnostic.
- [ ] Test qui épingle la cause : le seed sous une horloge figée à l'heure qui faisait échouer
      (`Carbon::setTestNow` ou équivalent, et la date de la session PostgreSQL alignée si c'est
      elle qui est en cause), vérifié par ablation du correctif.

## Critères d'acceptation

- [ ] AC1 — `php artisan test tests/Feature/Database/Seeders/SeedingTextAndDeterminismTest.php` est
      vert, et `SeedingFeatureTablesTest` reste vert.
- [ ] AC2 — Le test d'épinglage rougit sans le correctif et verdit avec (ablation consignée).
- [ ] AC3 — L'invariant `vedette_sans_une_statistique_par_jour` rend 0 sur un seed lancé à l'heure
      qui produisait les violations.

## Hors périmètre

- Les autres invariants de `ReferentialIntegrityChecker`.
- Le volume de biens semés (TCK-2382).

## Notes d'implémentation

_(à remplir par implementing-specs)_
