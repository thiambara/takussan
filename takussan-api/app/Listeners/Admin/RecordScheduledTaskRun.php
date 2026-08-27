<?php

namespace App\Listeners\Admin;

use App\Models\Enums\ScheduledTaskRunStatus;
use App\Services\Admin\ScheduledRunRecorder;
use Illuminate\Console\Events\ScheduledTaskFinished;

/**
 * TCK-383 — enregistre l'issue RÉELLE d'une exécution, au lieu du littéral `'finished'`.
 *
 * `ScheduledTaskFinished` veut dire « a fini de tourner », pas « a réussi » : le framework le
 * dispatche AVANT de contrôler le code de sortie. C'est donc `$event->task->exitCode` qui tranche,
 * et non le nom de l'événement.
 */
class RecordScheduledTaskRun
{
    public function __construct(private readonly ScheduledRunRecorder $recorder) {}

    public function handle(ScheduledTaskFinished $event): void
    {
        $exitCode = $event->task->exitCode;

        $status = match (true) {
            // Tâche détachée : `finish()` n'a pas été appelé, l'issue n'existe pas encore.
            $exitCode === null => ScheduledTaskRunStatus::Running,
            $exitCode === 0 => ScheduledTaskRunStatus::Finished,
            default => ScheduledTaskRunStatus::Failed,
        };

        // `$event->runtime` est en SECONDES. Le jeter, c'est ce qui rendait `avg(duration_ms)` nul
        // pour chaque tâche depuis toujours — un « — » à l'écran qui se lisait « jamais exécutée ».
        $this->recorder->record($event->task, $status, $event->runtime);
    }
}
