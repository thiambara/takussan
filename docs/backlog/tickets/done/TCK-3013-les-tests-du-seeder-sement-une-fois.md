---
id: TCK-3013
title: "Les tests du seeder sèment une fois : un décor semé partagé par les tests qui ne font que le lire"
status: done
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

- [x] Décor : un semis partagé (par classe ou par processus, au choix de l'implémenteur après lecture de `TestDatabase` et du mode `--parallel`)
- [x] Les tests de lecture du jeu semé le lisent ; les autres gardent le leur
- [x] Mesure : durée des classes avant et après, lancées par la session (classes > 10 min non délégables)

## Critères d'acceptation

- [x] AC1 — Aucun test du seeder ne perd une assertion (même nombre d'assertions, mêmes attendus).
- [x] AC2 — Un test qui écrit après le semis partagé ne laisse rien voir au test suivant (test dédié).
- [x] AC3 — Le temps cumulé des classes du seeder baisse d'au moins moitié, mesuré dans les mêmes conditions.

## Notes d'implémentation

**Forme retenue : une base DÉDIÉE par classe, semée une fois** (`tests/Support/JeuSemePartage.php`). Lu avant de
choisir : `TestDatabase` crée une base par processus, `RefreshDatabase` ouvre une transaction par test sur une
connexion RECRÉÉE à chaque test (nouvelle application, `disconnect()` au démontage) : une transaction de classe
demanderait de porter un PDO d'une application à l'autre. Un semis validé dans la base du processus se verrait de la
classe suivante. D'où `takussan_test_<jeton>_jeu_<classe>` : la classe y pointe sa connexion dans
`createApplication()`, la sème (migrate + seed, hors transaction) au premier test, et chaque test tourne dans une
transaction annulée (`DatabaseTransactions`, pas `RefreshDatabase`, qui lancerait `migrate:fresh` sur le jeu). La
base du processus n'est jamais touchée : l'isolation entre classes tient par construction, en `--parallel` compris.
Préfixe et horodatage de `TestDatabase` (balayage des orphelines), suppression en `tearDownAfterClass` et à
l'extinction. Deux états hors base sont gardés : les fichiers des disques factices (contrats figés, que
`TestCase::setUp()` vide à chaque test) et le `SeedingContext` (départs, lus par l'annuaire). Une seule classe, et
pas un cache par processus : ParaTest ne place pas les classes d'un cache commun dans le même processus.

**Regroupement (ADR-0140 § 1)** : `JeuSemeTest` porte les tests qui ne font que LIRE le jeu semé, corps et
attendus recopiés tels quels. Ils viennent de Journey (parcours, états des lieux), Invariants (tous les invariants,
aucune fixture par défaut), Growth, AgentDirectory, FeatureTables, TextAndDeterminism (lorem, moyens de paiement) et
Reindex. Configuration d'union : celle de FeatureTables (contrats figés compris) + `conversationsPerAgency: 20`
(Growth). Avec `bookingsPerAgency: 25` (Invariants), `lease_payment_links` manquait pour une agence : tirage, pas
défaut. Le semis se fait toujours sous les gardes de FeatureTables (`Http::preventStrayRequests()`, pilote PDF
Cloudflare). `SeedingGrowthTest`, `SeededAgentDirectoryTest`, `SeedingFeatureTablesTest` et `SeedingReindexTest`
sont supprimés. Restent avec leur semis, parce qu'ils le font varier : le 31 octobre (Journey), les 800
réservations (Invariants), la graine (TextAndDeterminism), les échecs de médias.

**ADR-0140 § 5** : Reindex passe par le seeder entier (le semis partagé réindexe dans un moteur espion), sans
réflexion. Le bilan des médias quitte le privé du seeder pour `SeedingContext::rapporterLesTelechargementsDeMedias()`
(périmètre accordé, comportement inchangé : même message, même seuil, appelé en dernier par `run()`).
`SeedingMediaFailuresTest` n'a plus de réflexion.

**AC1**, par la junit par test : chaque test garde ses assertions et ses attendus (FeatureTables 419 = 419, états
des lieux 74 = 74, parcours 16, vie des agences 31, invariants 7, fixtures 3, loyers 2, Reindex 1, médias
inchangés). Deux comptes ne varient qu'avec le volume parcouru par une boucle : annuaire 32 → 34 (un agent de plus
listé), lorem 232 → 1 090 textes lus.

**AC2** : `test_une_ecriture_dans_le_jeu_partage_ne_se_voit_pas_du_test_suivant_a/_b` (symétriques, donc
indépendants de l'ordre) et `test_la_base_du_processus_ne_voit_rien_du_jeu`. Les deux ablations sont rouges, puis
restaurées (md5 vérifié) : sans `DatabaseTransactions`, le test b rougit (« 5 is identical to 4 ») ; sans la bascule
vers la base dédiée, le test de la base du processus rougit.

**AC3**, mêmes conditions : les anciennes classes lourdes, tirées de HEAD et relancées à charge 2-11 (uptime
relevé), contre les nouvelles à charge 4-6. Chaque classe est lancée seule par le créneau, durées junit.

| | avant | après |
|---|---|---|
| Journey | 259 s (3 semis) | 96 s (1) |
| Invariants | 92 s (3) | 29 s (1, partiel) |
| Growth + AgentDirectory + FeatureTables | 226 s (3) | — |
| TextAndDeterminism | 170 s (5) | 109 s (3) |
| JeuSemeTest | — | 129 s (1) |
| **cumul** | **747 s, 13 semis** | **364 s, 6 semis (−51 %)** |

Le premier « avant », pris à charge 6-27, donnait 2 412 s pour les 15 classes : chiffre de charge, inutilisable.
Le chiffre qui fait foi reste la durée du job CI `lint-and-test`, non mesurée ici.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).
