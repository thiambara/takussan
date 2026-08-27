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
     * `runInBackground()`, dont le processus est détaché et dont l'issue arrive plus tard, dans un
     * AUTRE processus (`schedule:finish`). Enregistrer `finished` ici rendrait « a réussi » sur une
     * tâche dont personne n'a encore vu la fin.
     */
    case Running = 'running';
}
