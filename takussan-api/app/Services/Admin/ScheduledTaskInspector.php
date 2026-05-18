<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;

class ScheduledTaskInspector
{
    public function all(): array
    {
        return DB::table('scheduled_task_runs')
            ->select('task', DB::raw('max(last_run_at) as last_run_at'), DB::raw('avg(duration_ms) as average_duration_ms'))
            ->groupBy('task')
            ->orderBy('task')
            ->get()
            ->map(fn ($run) => [
                'task' => $run->task,
                'last_run_at' => $run->last_run_at,
                'next_due_at' => null,
                'average_duration_ms' => $run->average_duration_ms !== null ? (int) $run->average_duration_ms : null,
            ])
            ->all();
    }
}
