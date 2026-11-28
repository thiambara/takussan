---
id: TCK-3013
title: "Les tests du seeder sèment une fois : un décor semé partagé par les tests qui ne font que le lire"
status: todo
phase: P2
family: technique
estimate: M
wave: 99
created: 2026-11-28
updated: 2026-11-28
depends_on: [TCK-3012]
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, tests, back, architecture, adr-0140]
---

## Objectif utilisateur

La suite du back tourne plus vite sans perdre ce que les tests du seeder éprouvent.

## Contrat de données

`tests/Feature/Database/Seeders/` (15 fichiers, 38 tests) : 1 001 s cumulés sur 5 182 dans `.phpunit.result.cache` (≈ 19 %, exécutions de charge mêlée : parts relatives seulement). `SeedingJourneyTest` appelle `semer()` trois fois (450 s), chaque test re-sème `YearOfActivitySeeder`. Les tests qui ne font que LIRE le jeu semé (Journey, Invariants, Growth, AgentDirectory, FeatureTables…) peuvent partager un semis.

## Contraintes strictes (métier)

- L'isolation ne fuit pas : chaque test tourne dans une transaction annulée et la base est créée par processus (`Tests\Support\TestDatabase`). Un semis fait hors de cette transaction ne doit pas se voir dans une autre classe du même processus, ni en `--parallel`.
- Les tests qui FONT VARIER le semis (déterminisme, échecs de médias, réindexation) gardent leur propre semis.
- Le gain se mesure sur la durée du job CI `lint-and-test`, pas sur le cache local.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [ ] Décor : un semis partagé (par classe ou par processus, au choix de l'implémenteur après lecture de `TestDatabase` et du mode `--parallel`)
- [ ] Les tests de lecture du jeu semé le lisent ; les autres gardent le leur
- [ ] Mesure : durée des classes avant et après, lancées par la session (classes > 10 min non délégables)

## Critères d'acceptation

- [ ] AC1 — Aucun test du seeder ne perd une assertion (même nombre d'assertions, mêmes attendus).
- [ ] AC2 — Un test qui écrit après le semis partagé ne laisse rien voir au test suivant (test dédié).
- [ ] AC3 — Le temps cumulé des classes du seeder baisse d'au moins moitié, mesuré dans les mêmes conditions.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).
