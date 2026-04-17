<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PropertyVisit extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'property_id', 'visitor_id', 'customer_id', 'agent_id',
        'visitor_name', 'visitor_phone', 'visitor_email',
        'type', 'status', 'scheduled_at', 'duration_minutes',
        'completed_at', 'cancelled_at', 'cancellation_reason',
        'feedback', 'rating', 'notes', 'metadata',
    ];

    protected $casts = [
        'type' => VisitType::class,
        'status' => VisitStatus::class,
        'scheduled_at' => 'datetime',
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'rating' => 'decimal:1',
        'metadata' => 'array',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function visitor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'visitor_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'agent_id');
    }
}
