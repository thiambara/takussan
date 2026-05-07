<?php

namespace App\Listeners\Admin;

use App\Models\ScheduledTaskRun;
use Illuminate\Console\Events\ScheduledTaskFinished;

class RecordScheduledTaskRun
{
    public function handle(ScheduledTaskFinished $event): void
    {
        ScheduledTaskRun::query()->create([
            'task' => $event->task->description ?: $event->task->command ?? 'scheduled-task',
            'last_run_at' => now(),
            'duration_ms' => null,
            'status' => 'finished',
        ]);
    }
}
