---
id: TCK-3017
title: "Fusionner et alléger les grappes du relevé : un fichier par module, retraits prouvés par ablation"
status: todo
phase: P2
family: technique
estimate: L
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

La suite du back garde chaque défaut qu'elle attrape aujourd'hui, avec moins de fichiers qui se recouvrent.

## Contrat de données

Relevé exhaustif : `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/94f633e1-a1ae-4b22-af2b-442d465dff80/scratchpad/releve-tests/lot1-api.tsv`, `lot2.tsv`, `lot3.tsv`, `lot4.tsv` (colonnes : chemin, nb_tests, verdict, cible, raison). FUSIONNER 87 fichiers (~110 tests économisés), ALLEGER 127 (~250 à retirer), SUPPRIMER 7. Exemples : `ReviewModerationWorkflowTest` → `ReviewModerationQueueTest`, `RoleAccessTest` → `UserRoleControllerTest`, `BookingOverlapAndExpirationTest` → `BookingAvailabilityTest`, `InventoryTest` (10/13 redondants), `Search/ScoutSearchTest` (4/5 testent Scout), `Unit/ModelsTest`, les deux `ExampleTest`, `Testing/ApiTestCaseTest`. Hors de ce ticket : les lignes COUTURE (TCK-3014), les recensements (TCK-3015), la lecture (TCK-3016), le seeder (TCK-3013).

## Contraintes strictes (métier)

- Les TSV sont une liste de candidats, pas un ordre de travail : la plupart des verdicts « garder » ont été posés sur les noms. Relire les deux côtés de chaque grappe.
- Un test qui ne prouve pas ce qu'il dit se CORRIGE au lieu de partir (`PropertySimilarTest::test_second_call_is_served_from_cache` doit prouver le cache).
- Une fusion déplace les cas dans la classe du module (ADR-0140 § 1) ; un fichier fusionné disparaît.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [ ] Grappes FUSIONNER traitées une par une, ablation par grappe
- [ ] Lignes ALLEGER : retrait des tests nommés dans la raison, ablation par règle
- [ ] Lignes SUPPRIMER : retrait, sans ablation pour un test qui ne peut pas rougir
- [ ] Notes : par grappe, les tests retirés et la mutation qui a rougi à leur place

## Critères d'acceptation

- [ ] AC1 — Chaque retrait d'un test qui garde une règle est accompagné, dans les notes, d'une ablation qui rougit un test restant.
- [ ] AC2 — Aucune ligne « doute » n'est retirée.
- [ ] AC3 — Le job `couverture` de la PR reste au-dessus du cliquet (92 %).

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).
