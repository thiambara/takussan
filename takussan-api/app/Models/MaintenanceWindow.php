<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaintenanceWindow extends AbstractModel
{
    protected $fillable = [
        'starts_at',
        'ends_at',
        'mode',
        'severity',
        'messages',
        'banner_lead_minutes',
        'created_by_id',
        'cancelled_by_id',
        'cancelled_at',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'messages' => 'array',
        'cancelled_at' => 'datetime',
        'banner_lead_minutes' => 'integer',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by_id');
    }
}
