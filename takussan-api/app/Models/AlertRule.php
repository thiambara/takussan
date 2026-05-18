<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;

class AlertRule extends AbstractModel
{
    protected $fillable = [
        'event',
        'channels_json',
        'recipients_json',
        'is_active',
        'last_triggered_at',
        'failure_count',
        'updated_by_id',
    ];

    protected $casts = [
        'channels_json' => 'array',
        'recipients_json' => 'array',
        'is_active' => 'boolean',
        'last_triggered_at' => 'datetime',
        'failure_count' => 'integer',
    ];
}
