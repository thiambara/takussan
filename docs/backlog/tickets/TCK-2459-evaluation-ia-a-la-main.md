---
id: TCK-2459
title: "L'évaluation complète du socle IA ne tourne plus la nuit, et se lance à la main depuis la console"
status: doing
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-11-01
updated: 2026-11-01
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md"
tags: [ia, cout, console, adr-0076]
---

## Objectif utilisateur

Le porteur décide quand une évaluation complète appelle de vrais modèles, et la lance d'un bouton sans ouvrir de terminal.

## Pourquoi

`ai:eval --all` tournait chaque nuit à 02:30 UTC. Depuis la pose de la clé Anthropic en préproduction, ce passage coûte 1,10 $ par nuit (mesuré le 2026-11-01 : extraction 0,70 $, vérification d'accord 0,40 $), soit environ 33 $ par mois pour un environnement sans utilisateur. Décision du porteur du 2026-11-01 : la couper, et pouvoir la lancer à la main.

## Contrat

- `AI_EVAL_NIGHTLY` (défaut `false`) commande l'entrée planifiée. `true` la rallume.
- `GET /api/admin/ai/evaluations/suite` rend la dernière évaluation complète, ou `null`. Geste `platform.ai.view`.
- `POST /api/admin/ai/evaluations/suite` la met en file. Geste `platform.ai.manage`, step-up exigé. 409 `ai.eval.suite_already_running` si une évaluation complète est déjà en file ou en cours, 422 `ai.eval.no_provider` ou `ai.eval.no_cases`.
- Une évaluation complète est une ligne `ai_evaluation_runs` sans rôle ni candidat.
- `total_cost_usd` est calculé par l'API : un montant IA reste une chaîne décimale (ADR-0086).
- Elle ne réécrit jamais une référence : seul `php artisan ai:eval --update-baseline` le fait.

## Critères d'acceptation

- [x] L'entrée planifiée ne passe ses filtres que si `ai.eval_nightly` est vrai.
- [x] Un opérateur lance l'évaluation et lit le score, la référence et le coût de chaque usage.
- [x] Un score sous la référence se lit comme tel.
- [x] Deux lancements ne se doublent pas.
- [x] Le coût du dernier passage se lit avant de confirmer.
- [x] Un opérateur sans `platform.ai.manage` ne peut pas lancer, côté API comme côté écran.
- [ ] Vérifié sur la préproduction après promotion : l'entrée planifiée est coupée.

## Reste sur dev

- Après promotion sur `preview` : constater que `schedule:list` n'a plus l'entrée `ai:eval --all`.
