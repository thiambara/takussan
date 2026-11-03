---
id: TCK-899
title: "Temps figé et assertions effectives dans trois tests de l'API"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-12--tests--zones-non-gardées-tests-verts-sans-leur-code"
tags: [back, tests, pistes]
---

## Contexte

Réf : **P12.10** du fichier de pistes, `retenu · autonome` (A5). Le mesureur en a retenu deux
parties : le temps figé dans deux tests qui comparent deux `now()`, et trois `assertTrue(true)`.
Re-mesuré le 2026-10-18 :
- `SponsoredImpressionsTest` fige déjà son heure (`travelTo`, ajouté par TCK-708) : rien à faire ;
- `MaintenanceStructuredQuoteTest::test_amount_is_computed_from_the_lines` envoie
  `now()->addDays(10)` puis l'asserte par un second `now()`, sans temps figé ;
- `assertTrue(true)` dans `SeedingMediaFailuresTest.php:154`, `DigestBuilderServiceTest.php:131` et
  `tests/Unit/ExampleTest.php:14`.

## Objectif utilisateur

Un test de l'API ne rougit pas à minuit, et un test « ne fait rien » le prouve au lieu de
l'affirmer.

## Contrat de données

Aucun changement : les tests décrivent le contrat existant.

## Contraintes strictes

- Aucun code de production modifié.

## Delta à produire

- [x] `MaintenanceStructuredQuoteTest` : `freezeTime()` en tête du test qui compare deux `now()`.
- [x] `SeedingMediaFailuresTest` : la sortie du seeder est captée, et vide sans tentative.
- [x] `DigestBuilderServiceTest` : aucune requête pour une collection vide.

## Critères d'acceptation

- [x] AC1 — `test_amount_is_computed_from_the_lines` reste vert quand l'horloge avance entre la
  requête et l'assertion.
- [x] AC2 — Le rapport des médias du seeder n'imprime rien sans tentative, et le test rougit s'il
  imprime.
- [x] AC3 — `markDigested(collect())` n'émet aucune requête, et le test rougit s'il en émet une.

## Hors périmètre

- `tests/Unit/ExampleTest.php` (`assertTrue(true)` du test d'exemple du squelette Laravel, sans
  code à garder) : laissé tel quel, noté en reste de la piste.
- Les assertions sur les arguments des mocks front : partie non re-mesurée par le mesureur, les six
  tests ne sont pas nommés.

## Notes d'implémentation

- Reproduction de la course de minuit, par une horloge accélérée posée en tête du test pour la
  mesure seule (`Carbon::setTestNow` avec une closure qui avance d'un jour à chaque appel) : sans
  `freezeTime()` → rouge, `'2026-12-23'` attendu contre `'2027-02-12'` rendu ; avec → vert.
  L'horloge accélérée n'est pas commitée.
- Ablations, chacune remise après : la garde `$attempted === 0` retirée de
  `YearOfActivitySeeder::reportMediaDownloads()` → rouge (`> Médias : 0 téléchargement(s)…`
  imprimé) ; la garde `empty($ids)` retirée de `DigestBuilderService::markDigested()` → rouge
  (`update "app_notifications" … where 0 = 1`). Avec `assertTrue(true)`, ces deux tests restaient
  verts par construction.
- Le seeder résolu par le conteneur n'a pas de commande : il écrivait dans `null`. Le test lui en
  donne une (`setCommand`), dont la sortie est un `BufferedOutput`.
