---
id: TCK-2341
title: "takussan-api/CLAUDE.md, § Tâches planifiées : le compte des Schedule::job se recompte, et withoutOverlapping ne couvre que leur mise en file"
status: todo
phase: P3
family: docs
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-5--jobs-planifiés-et-files"
  docs:
    - "takussan-api/CLAUDE.md#tâches-planifiées"
tags: [back, scheduler, files, documentation, pistes]
---

## Objectif utilisateur

Qu'un agent ou un développeur qui lit `takussan-api/CLAUDE.md` sache ce que le verrou du scheduler
protège vraiment, et recompte les tâches au lieu de croire un chiffre périmé.

## Contexte

Réf : **P05.07** du fichier de pistes, `validé`.

- Le § Tâches planifiées dit « 77 lignes : 13 `Schedule::job()` et 6 `Schedule::command()`, presque
  tous `->withoutOverlapping()` ». Mesuré le 2026-10-25 : `routes/console.php` fait 218 lignes,
  24 appels `Schedule::job(` (27 événements, le battement de file étant planifié une fois par file)
  et 26 `Schedule::command(`.
- `Schedule::job()` ne planifie qu'une fermeture qui met le job en file (`Schedule.php:217-226` du
  framework) : le verrou de `withoutOverlapping()` est rendu dès la mise en file, et
  `scheduled_task_runs` mesure cette mise en file (mesuré le 2026-10-15 par le mesureur : de 0 à 600 ms, toujours `finished`). L'exécution,
  dans le worker, n'est couverte par aucun verrou, sauf `WithoutOverlapping` sur deux jobs
  (`SendSavedSearchAlerts`, `SendFavoriteChangeAlerts`) ; un échec n'y apparaît que dans
  `failed_jobs`, ou par `AlertsOnFirstFailure` (TCK-772, P14.04).

## Décision du porteur

- P05.07 :

  > validation du porteur (2026-10-25) : `takussan-api/CLAUDE.md` § Tâches planifiées corrigé (compte des `Schedule::job` et portée de `withoutOverlapping`, qui ne couvre que la mise en file) ; verrou d'exécution des balayages non retenu tant que chaque job planifié est idempotent

## Hypothèses

- Le compte s'écrit sous forme de commandes qui recomptent, jamais de chiffre figé (consigne du lot) :
  un `grep -c` sur `routes/console.php`, et `php artisan schedule:list` pour les événements.
- « Verrou d'exécution des balayages non retenu » s'écrit comme une règle : aucun middleware
  `WithoutOverlapping` ni `ShouldBeUnique` n'est ajouté, et la condition (chaque job planifié est
  idempotent, et son commentaire `TCK-NNN` le dit) devient l'invariant à tenir.
- Le reste du paragraphe (les « 16 commandes maison ») n'est pas dans la décision : il ne change pas.

## Delta à produire

- [ ] `takussan-api/CLAUDE.md`, § Tâches planifiées : les commandes qui recomptent, la portée de
      `withoutOverlapping` pour un `Schedule::job` et pour un `Schedule::command`, ce que mesure
      `scheduled_task_runs`, et la règle « pas de verrou d'exécution tant que chaque job est
      idempotent ».

## Critères d'acceptation

- [ ] AC1 — Le § ne porte plus de compte figé de `Schedule::job` ni de `Schedule::command` ; les
      commandes qu'il donne rendent le compte du jour quand on les lance.
- [ ] AC2 — Le § dit que `withoutOverlapping()` sur un `Schedule::job` ne couvre que la mise en file,
      et que `scheduled_task_runs` mesure cette mise en file.
- [ ] AC3 — Le § dit que le verrou d'exécution des balayages n'est pas retenu tant que chaque job
      planifié est idempotent.

## Hors périmètre

- Le middleware `WithoutOverlapping` ou `ShouldBeUnique` sur les balayages : non retenu par la
  décision.
- Le compte des « 16 commandes maison » du même §, périmé lui aussi (44 fichiers sous
  `app/Console/Commands` le 2026-10-25) : hors décision, signalé au rapport.

## Notes d'implémentation
