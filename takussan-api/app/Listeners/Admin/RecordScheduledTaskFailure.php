<?php

namespace App\Listeners\Admin;

use App\Models\Enums\ScheduledTaskRunStatus;
use App\Services\Admin\ScheduledRunRecorder;
use Illuminate\Console\Events\ScheduledTaskFailed;

/**
 * TCK-383 — `ScheduledTaskFailed` n'avait AUCUN écouteur dans ce dépôt.
 *
 * Deux chemins y mènent, et un seul est déjà couvert par `RecordScheduledTaskRun` :
 *
 *  1. l'exécution lève — `ScheduledTaskFinished` n'est jamais dispatché, et cet écouteur est le
 *     SEUL à voir passer l'exécution ;
 *  2. l'exécution sort en code non nul — les deux événements passent, et le recorder met à jour la
 *     ligne déjà écrite plutôt que d'en créer une seconde.
 */
class RecordScheduledTaskFailure
{
    public function __construct(private readonly ScheduledRunRecorder $recorder) {}

    public function handle(ScheduledTaskFailed $event): void
    {
        // Aucune durée : l'événement n'en porte pas. `null` dit « non mesurée », et le recorder
        // se garde bien d'écraser une durée déjà relevée par `ScheduledTaskFinished`.
        $this->recorder->record($event->task, ScheduledTaskRunStatus::Failed);
    }
}
