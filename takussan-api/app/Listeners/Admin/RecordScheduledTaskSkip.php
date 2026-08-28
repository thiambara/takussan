<?php

namespace App\Listeners\Admin;

use App\Models\Enums\ScheduledTaskRunStatus;
use App\Services\Admin\ScheduledRunRecorder;
use Illuminate\Console\Events\ScheduledTaskSkipped;

/**
 * TCK-383 — une tâche écartée par un filtre (`when`, `skip`, `withoutOverlapping`, fenêtre de
 * maintenance) ne tourne pas, et n'échoue pas non plus.
 *
 * Sans cet écouteur, elle ne laissait aucune trace : l'écran affichait la dernière exécution
 * RÉUSSIE comme si elle était la dernière tentative, et un `withoutOverlapping` qui bloque une
 * tâche depuis trois jours restait indistinguable d'une tâche en bonne santé.
 */
class RecordScheduledTaskSkip
{
    public function __construct(private readonly ScheduledRunRecorder $recorder) {}

    public function handle(ScheduledTaskSkipped $event): void
    {
        $this->recorder->record($event->task, ScheduledTaskRunStatus::Skipped);
    }
}
