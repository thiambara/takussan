<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\ScheduledTaskRunStatus;

class ScheduledTaskRun extends AbstractModel
{
    protected $fillable = ['task', 'last_run_at', 'duration_ms', 'status'];

    protected $casts = [
        'last_run_at' => 'datetime',
        'duration_ms' => 'integer',
        // TCK-383 — la colonne portait le littéral `'finished'` de son unique écrivain ; le cast
        // la ramène au vocabulaire que le recorder écrit vraiment.
        'status' => ScheduledTaskRunStatus::class,
    ];
}
