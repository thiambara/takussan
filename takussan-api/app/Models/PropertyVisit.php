<?php

namespace App\Models;

use App\Http\Filters\RangeFilter;
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

    protected static array $requestFilterable = ['property_id', 'visitor_id', 'customer_id', 'agent_id', 'type', 'status'];

    /**
     * TCK-075 — `scheduled_at_min` / `scheduled_at_max` power the "À venir /
     * Passées" tabs on the frontend (`/app/visits`). Spatie exposes them as
     * `filter[scheduled_at_min]=…` via {@see RangeFilter}.
     */
    protected static array $requestRangeFilters = ['scheduled_at'];

    protected static array $requestSortable = ['id', 'created_at', 'scheduled_at', 'status'];

    protected static array $requestLoadable = ['property', 'visitor', 'customer', 'agent'];

    protected static array $queryFields = [
        'id', 'property_id', 'visitor_id', 'customer_id', 'agent_id',
        'type', 'status', 'scheduled_at', 'completed_at', 'duration_minutes',
        'feedback', 'rating', 'notes', 'metadata',
        'created_at', 'updated_at',
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
