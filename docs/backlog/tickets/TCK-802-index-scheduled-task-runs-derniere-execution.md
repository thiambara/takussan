---
id: TCK-802
title: "`scheduled_task_runs` : un index (task, last_run_at desc, id desc) pour lire la dernière exécution sans tri"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#61-scheduledtaskrun-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes"
tags: [back, scheduler, index, performance, pistes]
---

## Objectif utilisateur

La console des tâches planifiées lit la dernière exécution de chaque tâche par un index, sans
relire ni trier tout son historique.

## Contexte

Réf : **P02.11** du fichier de pistes, `validé` (critère du dernier classement accordé : V4).

**Décision du porteur** (recopiée mot pour mot) :

> un index et une purge à 90 jours

**Hypothèse notée (mode sans humain)** : P19.05, de même cause, porte une autre décision du
porteur sur la même table : « purge planifiée à 7 jours, en gardant la dernière exécution par
tâche ». Les deux durées se contredisent. Ce ticket pose l'index (critère A2) et laisse la purge au
porteur ; l'entrée passe à `fait — reste`.

## Contrat de données

- Migration neuve `index_scheduled_task_runs_on_task_and_latest_run` : index
  `scheduled_task_runs_task_last_run_idx` sur `(task, last_run_at desc, id desc)`, `down()` qui le
  retire. L'index `task` existant reste.

## Contraintes strictes (métier)

- Aucun résultat ne change : ajout d'index seul.

## Delta à produire

- [x] Migration d'ajout d'index (neuve), avec son `down()`.
- [x] Test : `Tests\Feature\Database\ScheduledTaskRunsIndexTest` (index présent, plan sans `Sort`).

## Critères d'acceptation

- [x] AC1 — l'index `(task, last_run_at, id)` existe sur `scheduled_task_runs`.
- [x] AC2 — `where task = ? order by last_run_at desc, id desc limit 1` se lit par cet index, sans
  nœud `Sort`.

## Hors périmètre

- **Reste à faire** : la purge planifiée, dont la durée (90 jours ici, 7 jours en P19.05) est à
  trancher par le porteur.
- La sonde de santé (`HealthcheckService::scheduler()`, `latest('last_run_at')` sans filtre de
  tâche) ne profite pas de cet index, dont `task` est la première colonne : elle restera un
  balayage tant que la table n'est pas purgée.
- `models-spec.md` § 61 ne liste que l'index `task` : à compléter par `/sync-specs` (spec fermée
  à l'agent).

## Notes d'implémentation

- Ablation : la migration retirée, les deux tests rougissent (index absent ; plan sans l'index) ;
  remise, ils sont verts.
- Le test du plan pose `SET LOCAL enable_seqscan = off` : sur une table de test de 50 lignes, le
  moteur balaierait quel que soit l'index. Avec le seul index `task`, le plan porte un `Sort`.
