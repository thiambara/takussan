---
id: TCK-801
title: "Tâches planifiées : un nom stable sans le binaire PHP, et une durée moyenne sur 7 jours"
status: done
phase: P2
family: bug
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-19--rétention-des-tables-qui-grossissent"
tags: [back, scheduler, exploitation, pistes]
---

## Objectif utilisateur

Le super-admin lit, dans la console des tâches planifiées, un historique par tâche qui ne se coupe
pas au changement de version de PHP, et une durée moyenne qui montre une régression récente.

## Contexte

Réf : **P19.05** du fichier de pistes, `validé` (critères du dernier classement accordés : V4 et
V7).

**Décision du porteur** (recopiée mot pour mot) :

> purge planifiée à 7 jours, en gardant la dernière exécution par tâche ; moyenne sur 7 jours ; nom stable sans le binaire PHP

**Hypothèse notée (mode sans humain)** : P02.11, de même cause, porte une autre décision du
porteur, postérieure (2026-10-16 contre 2026-10-15) : « un index et une purge à 90 jours ». Les
deux durées de purge se contredisent pour la même table. Ce ticket ne pose donc **pas** la purge :
elle revient au porteur, et l'entrée passe à `fait — reste`.

## Contrat de données

- `ScheduledRunRecorder::nomDe()` : le nom d'une commande Artisan planifiée ne porte plus le binaire
  PHP ni `artisan` (`health:probe`, et non `'/opt/…/php' 'artisan' health:probe`).
- `GET /api/admin/scheduler` : `average_duration_ms` est la moyenne des exécutions des 7 derniers
  jours ; `null` si aucune n'est mesurée sur la fenêtre. Forme de la réponse inchangée.

## Contraintes strictes (métier)

- Un nom posé par `->name()` et une commande système (`Schedule::exec`) restent tels quels.
- `last_run_at` et `last_status` restent pris sur tout l'historique.

## Delta à produire

- [x] `ScheduledRunRecorder::nomDe()` retire le préfixe « binaire PHP + artisan », quel que soit
  son chemin.
- [x] `ScheduledTaskInspector::all()` : `avg(duration_ms) filter (where last_run_at >= now - 7 j)`.
- [x] Tests : `SchedulerRunStatusTest` (deux binaires → un nom ; moyenne sur 7 jours).

## Critères d'acceptation

- [x] AC1 — deux chemins de binaire PHP différents donnent le même nom de tâche.
- [x] AC2 — une exécution vieille de plus de 7 jours n'entre pas dans `average_duration_ms`.

## Hors périmètre

- **Reste à faire** : la purge planifiée de `scheduled_task_runs`, dont la durée (7 jours ici,
  90 jours en P02.11) est à trancher par le porteur.
- Les lignes déjà écrites sous l'ancien nom ne sont pas renommées (réécriture de données, V4) :
  la console listera l'ancien et le nouveau nom jusqu'à la purge.
- Le libellé de la colonne « durée moyenne » du front ne dit pas la fenêtre.

## Notes d'implémentation

- Ablation : le correctif retiré (`app/` revenu à `pre-dev`), les deux tests neufs rougissent
  (« two strings are identical », « 5100 is identical to 200 ») ; remis, la classe est verte
  (10 tests).
- Le préfixe se reconnaît par motif, pas par `Application::formatCommandString('')` : ce dernier
  ne connaît que le binaire de la machine courante, et le test exige deux chemins différents.
- `models-spec.md` § 61 n'est pas touché (fermé à l'agent) ; rien de son contenu ne change.
