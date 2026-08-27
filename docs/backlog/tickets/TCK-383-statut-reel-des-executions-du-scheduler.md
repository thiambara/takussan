---
id: TCK-383
title: "Scheduler — enregistrer le statut RÉEL et la durée d'une exécution, au lieu d'une constante"
status: todo
phase: P2
family: full
estimate: S
wave: 46
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [api, observabilite, scheduler]
---

## Contexte — ouvert par TCK-365, sur mesure et non sur supposition

TCK-365 devait ajouter une colonne « statut de la dernière exécution » à `/super-admin/system/scheduler`,
et sa contrainte disait : *« le statut n'est affiché que si l'API le fournit ; s'il ne l'expose pas, le
ticket le constate et ouvre le besoin côté API plutôt que de l'inventer côté front. »*

La mesure a rendu quelque chose de plus dur que « l'API ne l'expose pas ». **La donnée n'existe pas,
et elle n'existera pas en changeant l'API seule** :

1. `scheduled_task_runs` **a bien une colonne `status`** (`2026_05_07_000226_create_scheduled_task_runs_table.php`,
   `$table->string('status')->default('finished')`). L'exposer serait donc à première vue un
   trois-lignes dans `ScheduledTaskInspector`.

2. **Mais le seul écrivain de la table l'écrit en dur.** `App\Listeners\Admin\RecordScheduledTaskRun`
   pose `'status' => 'finished'` — littéralement, sans condition. La colonne est une **constante
   déguisée en mesure** : l'afficher rendrait « finished » sur une tâche qui vient d'échouer.

3. **Et l'événement écouté ne peut PAS distinguer les deux.** `AppServiceProvider:413` n'écoute que
   `ScheduledTaskFinished`. Or `ScheduleRunCommand` le dispatche **avant** le contrôle du code de
   sortie :

   ```php
   // vendor/laravel/framework/.../Scheduling/ScheduleRunCommand.php:207-218
   $this->dispatcher->dispatch(new ScheduledTaskFinished($event, round(microtime(true) - $start, 2)));
   $this->eventsRan = true;
   if ($event->exitCode != 0 && ! $event->runInBackground) {
       throw new Exception("Scheduled command [{$event->command}] failed with exit code [{$event->exitCode}].");
   }
   // …
   $this->dispatcher->dispatch(new ScheduledTaskFailed($event, $e));
   ```

   `ScheduledTaskFinished` veut dire « a fini de tourner », pas « a réussi ». **`ScheduledTaskFailed`
   et `ScheduledTaskSkipped` n'ont AUCUN écouteur dans ce dépôt** (`grep -rn 'ScheduledTaskFailed' app/`
   → 0). Une exécution en échec est donc enregistrée aujourd'hui comme `finished`, exactement comme
   une réussie.

4. **Corollaire non demandé mais mesuré : la colonne « Durée moyenne » de `/system/scheduler` est
   structurellement toujours vide.** Le listener écrit `'duration_ms' => null` alors que
   `ScheduledTaskFinished::$runtime` porte la durée en secondes, déjà arrondie par le framework.
   `avg(duration_ms)` d'une colonne toujours nulle rend `null`, donc l'écran rend `—` pour chaque
   tâche, depuis toujours. Ce n'est pas « aucune tâche n'a encore tourné » : c'est une mesure jetée
   à l'écriture.

> *« Il a tourné » et « il a réussi » ne sont pas la même information* — et une colonne `status`
> présente en base ne prouve pas qu'on ait mesuré quoi que ce soit. C'est le même motif que le
> `0/0` du cliquet de couverture : une valeur par défaut jamais écrasée ressemble à une mesure.

## Delta à produire

- [ ] `RecordScheduledTaskRun` écrit `duration_ms` depuis `ScheduledTaskFinished::$runtime`
      (secondes flottantes → millisecondes entières) au lieu de `null`.
- [ ] `RecordScheduledTaskRun` écrit le statut réel : `$event->task->exitCode` distingue `finished`
      d'`failed` sur l'événement déjà écouté. ⚠ `exitCode` est nul tant que la tâche tourne en
      arrière-plan (`runInBackground`) — décider explicitement ce qu'on enregistre dans ce cas
      plutôt que de laisser le défaut trancher.
- [ ] Écouteurs de `ScheduledTaskFailed` et `ScheduledTaskSkipped` (`failed` / `skipped`), branchés
      dans `AppServiceProvider` à côté de l'écouteur existant.
- [ ] `ScheduledTaskInspector::all()` expose `last_status` — le statut de la ligne dont
      `last_run_at` est le maximum, **pas un agrégat** : `max(status)` sur une chaîne serait un
      ordre alphabétique, pas une chronologie. Un `DISTINCT ON (task) … ORDER BY task, last_run_at DESC`
      (PostgreSQL, ADR-0020) ou une sous-requête corrélée.
- [ ] Le front ajoute la colonne statut sur `/super-admin/system/scheduler` (`ScheduledTaskTable`),
      en `StatusBadge`, et `ScheduledTask` gagne `last_status` dans `src/types/super-admin.ts`.

## Critères d'acceptation

- [ ] AC1 — une tâche planifiée qui sort en code non nul est enregistrée avec un statut distinct de
      celui d'une tâche réussie. **Le test fait échouer une vraie tâche** : asserter sur deux lignes
      insérées à la main cocherait aussi l'implémentation actuelle.
- [ ] AC2 — `GET /api/admin/scheduler` rend le statut de la DERNIÈRE exécution de chaque tâche. Le
      test pose, pour une même tâche, une exécution ancienne `failed` et une récente `finished`, et
      attend `finished` — un test à une seule ligne par tâche ne distinguerait pas un agrégat d'un
      « dernier ».
- [ ] AC3 — `average_duration_ms` rend une valeur non nulle après une exécution réelle.
- [ ] AC4 — `./vendor/bin/pint`, les tests touchés, `npm run lint`, `npx tsc --noEmit` passent.

## Hors périmètre

- Le déclenchement manuel d'une tâche planifiée (« lancer maintenant ») — aucun endpoint ne l'expose
  et cela reste une décision produit, comme le disait déjà TCK-365.
- La rétention / purge de `scheduled_task_runs`, qui grossit d'une ligne par tâche et par exécution
  sans qu'aucun élagage n'existe. À ouvrir séparément si le besoin se confirme.

## Notes d'implémentation

_(Rempli pendant le travail.)_
