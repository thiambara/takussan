<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;

class ScheduledTaskRun extends AbstractModel
{
    protected $fillable = ['task', 'last_run_at', 'duration_ms', 'status'];

    protected $casts = [
        'last_run_at' => 'datetime',
        'duration_ms' => 'integer',
    ];
}
