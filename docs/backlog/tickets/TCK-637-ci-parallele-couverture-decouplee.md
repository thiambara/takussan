---
id: TCK-637
title: "CI — la suite de l'API en `--parallel`, la couverture découplée de l'exécution qui juge les tests"
status: todo
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-13
updated: 2026-10-13
depends_on: [TCK-636]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, github, ci, couverture, adr-0063]
---

## Objectif utilisateur

- **Le porteur, qui livre** : la seule exécution complète qui reste après TCK-636 — la PR vers
  `dev` — prend moins de temps.

## Contrat de données

Aucune donnée applicative. [ADR-0063](../../adr/0063-attestation-de-ci-par-arbre.md) §4 et
[J-12](../../journal-des-corrections.md#j-12) : `--parallel` est validé en local (TCK-321, TCK-322,
TCK-334), son gain en CI est mesuré à ×2,48, mais une seule exécution porte les tests **et** la
couverture, et PCOV agrège mal entre processus.

## Contraintes strictes (métier)

- Le cliquet de couverture (86 %, `bin/coverage-gate.php`) reste évalué sur chaque PR vers `dev`,
  sur un clover complet — ou l'ADR qui le déplace dit où et pourquoi.
- La carte d'impact (nuit, ADR-0063 §3) garde son `cov.php` à attribution test → lignes.

## Delta à produire

- [ ] Mesurer en CI : suite `--parallel` sans couverture, et couverture seule, sur le même arbre.
- [ ] Choisir entre deux jobs (tests parallèles + couverture séquentielle en parallèle d'eux) et
      une couverture fusionnée (`phpcov merge`) ; écrire la décision en amendement d'ADR-0063.
- [ ] Le job qui dépose l'attestation (TCK-636) reste celui qui juge les tests.

## Critères d'acceptation

- [ ] AC1 — Durée du check requis « API / lint-and-test » sur une PR vers `dev` relevée avant et
      après, sur trois exécutions chacune.
- [ ] AC2 — Le cliquet rougit toujours par ablation (une ligne couverte retirée sous le seuil).

## Hors périmètre

- Le front : sa suite ne porte pas de couverture.
