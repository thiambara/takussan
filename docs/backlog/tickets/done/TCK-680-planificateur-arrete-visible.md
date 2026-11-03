---
id: TCK-680
title: "Un planificateur arrêté fait échouer la santé, et /api/health répond 503 sur failed"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production
tags: [back, health, observabilite, pistes]
---

## Contexte

Réf : **P14.02** du fichier de pistes, `validé` par le porteur (critère accordé : V5).

La sonde `scheduler` de `HealthcheckService::probe()` relevait `last_run_at` sans `status`, et
le statut global ne prenait que les autres sondes : un planificateur arrêté laissait la santé à
`ok`. Et `HealthController` rendait le statut avec un HTTP 200 quel qu'il soit, `failed` compris,
si bien qu'une sonde externe sur le code de réponse ne voyait rien.

## Décision du porteur

sonde scheduler avec status (échec après 5 min sans exécution), /api/health en 503 sur failed ; reste : les healthchecks des workers et la sonde UptimeRobot, par le porteur

## Reste à faire

les healthchecks des workers et la sonde UptimeRobot, par le porteur

## Objectif

Un planificateur sans exécution depuis cinq minutes rend la sonde `scheduler`, et donc la santé,
`failed` ; `/api/health` répond alors 503.

## Delta à produire

- [x] `HealthcheckService` : la sonde `scheduler` passe par `check()` et compte dans `worst()` ;
      `failed` quand la dernière ligne de `scheduled_task_runs` a 300 s ou plus, ou qu'il n'y en a
      aucune (`SCHEDULER_FAILED_AFTER_SECONDS`).
- [x] `HealthController` : 503 quand le statut lu est `failed`, 200 sinon ; corps inchangé.
- [x] Tests : `HealthcheckProbesTest` (trois cas du planificateur), `HealthCheckTest` (503 sur
      `failed`, 200 sur `degraded` et `unknown`) ; le cas « santé dégradée » d'
      `EvaluateOperationalAlertsTest` reçoit une exécution récente pour rester `degraded`.

## Critères d'acceptation

- [x] AC1 — Dernière exécution il y a 301 s : sonde `scheduler` et statut global `failed`.
- [x] AC2 — Dernière exécution il y a 60 s, autres sondes saines : sonde `scheduler` et statut global `ok`.
- [x] AC3 — Aucune exécution enregistrée : sonde `scheduler` `failed`.
- [x] AC4 — `/api/health` rend 503 et le même corps quand le statut en cache est `failed` ; 200 pour
      `degraded` et `unknown`.

## Hypothèses (mode sans humain)

- « échec après 5 min sans exécution » : seuil inclusif à 300 s, comme les battements des workers.
  La sonde n'a pas d'état `degraded` : la précision n'en décrit pas.
- Aucune ligne dans `scheduled_task_runs` vaut un planificateur qui n'a jamais tourné, donc `failed`.
- `unknown` reste en 200 : la précision ne retient que `failed` pour le 503, alors que la `Piste`
  proposait aussi `unknown`.

## Hors périmètre

- Les healthchecks des workers et la sonde UptimeRobot (reste du porteur).
- `docs/infra/cdn.md` (« always returns HTTP 200 ») devient faux sur `failed` : chemin fermé à
  l'implémenteur, signalé dans la PR.
- Quand le planificateur est arrêté, `health:probe` ne tourne plus : le statut public expire et
  passe à `unknown`, donc 200, au bout de dix minutes. Seule la console (qui sonde à la lecture)
  et `alerts:evaluate` verraient `failed`, et ce dernier tourne lui aussi dans le planificateur.

## Notes d'implémentation

- Rouge avant correctif : 200 au lieu de 503 ; `Undefined array key "status"` sur la sonde
  `scheduler`.
- Ablation (les deux fichiers d'`app/` retirés) : 4 rouges sur 25 ; correctif remis : 25 verts.
- Piège : le cas « santé dégradée » d'`EvaluateOperationalAlertsTest` n'avait aucune exécution
  planifiée ; sans fixture, il passe à `failed`.
