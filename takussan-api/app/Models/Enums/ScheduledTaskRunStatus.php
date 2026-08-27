<?php

namespace App\Models\Enums;

/**
 * TCK-383 — issue d'une exécution du scheduler.
 *
 * La colonne `scheduled_task_runs.status` existe depuis la création de la table, mais son seul
 * écrivain y posait le littéral `'finished'` : une CONSTANTE déguisée en mesure. Cette énumération
 * n'ajoute donc pas un vocabulaire, elle en rend un lisible pour la première fois.
 *
 * ⚠ `Finished` ne veut pas dire « a réussi » côté framework — `ScheduledTaskFinished` est dispatché
 * AVANT le contrôle du code de sortie (`ScheduleRunCommand:207-218`). Ici, au contraire, `Finished`
 * signifie « a terminé avec un code de sortie nul » : c'est la traduction, pas l'écho, de l'événement.
 */
enum ScheduledTaskRunStatus: string
{
    /** Code de sortie nul. */
    case Finished = 'finished';

    /** Code de sortie non nul, ou exception levée pendant l'exécution. */
    case Failed = 'failed';

    /** Un filtre (`when`, `skip`, `withoutOverlapping`, fenêtre de maintenance) a écarté la tâche. */
    case Skipped = 'skipped';

    /**
     * Le code de sortie n'est PAS connu au moment où l'on enregistre — cas d'une tâche
     * `runInBackground()`, dont le processus est détaché. Enregistrer `finished` ici rendrait
     * « a réussi » sur une tâche dont personne n'a vu la fin.
     *
     * ⚠⚠ **RIEN NE RÉSOUT CE STATUT AUJOURD'HUI, ET C'EST UNE IMPASSE ASSUMÉE, PAS UN OUBLI.**
     * Mesuré le 2026-08-27 :
     *
     *   - `ScheduleFinishCommand:48` dispatche `ScheduledBackgroundTaskFinished` — un événement
     *     **DIFFÉRENT** de `ScheduledTaskFinished`, dans un autre processus ;
     *   - `grep -rn 'ScheduledBackgroundTaskFinished' app/ routes/` → **rien**, et
     *     `Event::getListeners(ScheduledBackgroundTaskFinished::class)` → **0**.
     *
     * Une ligne posée à `running` reste donc `running` **pour toujours**, et l'écran afficherait une
     * tâche perpétuellement « en cours ». Le cas n'est atteint par **aucune** des 22 tâches
     * planifiées (`runInBackground` = 0, mesuré), c'est pourquoi la branche reste défensive plutôt
     * que résolue.
     *
     * **Le jour où une tâche passe en `runInBackground()`**, il faut un écouteur de
     * `ScheduledBackgroundTaskFinished` qui retrouve la dernière ligne `running` de cette tâche et
     * la ferme sur `$event->task->exitCode`. ⚠ La déduplication par `spl_object_id` de
     * `ScheduledRunRecorder` **ne peut pas** servir : `schedule:finish` tourne dans un autre
     * processus et reconstruit l'objet `Event` par son mutex, donc l'identité d'objet ne survit pas.
     *
     * `SchedulerRunStatusTest::test_a_background_task_would_leave_its_run_stuck_in_running` rougit
     * le jour où cette condition change — *un commentaire ne garde rien ; c'est le test qui garde.*
     */
    case Running = 'running';
}
