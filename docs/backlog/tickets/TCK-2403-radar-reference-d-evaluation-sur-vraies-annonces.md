---
id: TCK-2403
title: "Radar : le jeu d'évaluation de l'extraction passe à de vraies annonces anonymisées, et sa référence est fixée"
status: todo
phase: P1
family: technique
estimate: S
wave: 80
created: 2026-10-27
updated: 2026-10-27
depends_on: [TCK-2386]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, evaluation, donnees-personnelles, adr-0076, adr-0077]
---

## Objectif utilisateur

Le porteur sait qu'un changement de modèle ou de prompt de l'extraction du Radar ne dégrade pas la
lecture des annonces telles qu'elles circulent réellement à Dakar, parce que le cliquet d'évaluation
la mesure sur de vraies annonces.

## Contrat de données

Aucune donnée ni route nouvelle. Le jeu vit sous `takussan-api/resources/ai/evals/radar.extraction/`
(format, notation et champs : son `README.md`, livré par TCK-2386) ; la référence est le
`baseline.json` que `php artisan ai:eval radar.extraction --update-baseline` écrit (socle,
ADR-0076 §8).

## Contraintes strictes (métier)

- **Sorti de TCK-2386 (son AC8), décision du porteur du 2026-10-27** : TCK-2386 a livré 30 cas
  **synthétiques** et aucune référence ; tant que `baseline.json` n'existe pas, le cliquet de
  l'usage `radar.extraction` ne garde rien.
- **De vraies annonces, anonymisées** : prises parmi les annonces saisies et relues dans le Radar
  (TCK-2387), numéros, noms de personne ou d'agence et courriels remplacés par les jetons du jeu
  (`[TELEPHONE]`, `[NOM]`). `scripts/check-ai-evals-pii.mjs` garde numéros et courriels ; **rien ne
  garde les noms** : relecture humaine de chaque cas.
- L'`input` de chaque cas reste exactement ce que le job envoie (`ExternalContent::wrap()`),
  ce que `RadarExtractionEvalSetTest` vérifie.
- **La référence s'écrit par un passage COMPLET** (rôles `extraction` et `vision`) : une première
  référence partielle est refusée (`ai.eval.baseline_needs_full_run`).
- **Le passage réel coûte** (appel au vrai modèle, une trentaine de cas) : il attend l'accord
  explicite du porteur, et se lance à la main, jamais depuis un test ni la CI.

## Delta à produire

- [ ] Remplacer ou compléter les cas synthétiques par des annonces réelles anonymisées (au moins
      la moitié du jeu, textes et captures), sorties attendues relues ; `README.md` mis à jour.
- [ ] Passage complet `php artisan ai:eval radar.extraction --update-baseline` (accord du
      porteur), `baseline.json` versionné.
- [ ] `RadarExtractionEvalSetTest` : vert sur le jeu nouveau.

## Critères d'acceptation

- [ ] AC1 — `ai:eval radar.extraction` passe sur le jeu livré et en fixe la référence (ex-AC8 de
      TCK-2386).
- [ ] AC2 — Au moins la moitié des cas viennent d'annonces réelles, et aucun ne porte de numéro, de
      courriel ou de nom réel (garde verte, relecture notée dans le `README.md`).

## Hors périmètre

- Les jeux d'évaluation des autres usages IA du Radar (démarchage, preuve d'accord : TCK-2388).
- Un changement du prompt ou du modèle de l'extraction.

## Notes d'implémentation

_(à remplir par implementing-specs)_
