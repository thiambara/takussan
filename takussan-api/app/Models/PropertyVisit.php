<?php

namespace App\Models;

use App\Http\Filters\RangeFilter;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\QueryBuilder\AllowedFilter;

class PropertyVisit extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'property_id', 'visitor_id', 'customer_id', 'agent_id',
        'visitor_name', 'visitor_phone', 'visitor_email',
        'type', 'status', 'scheduled_at', 'duration_minutes',
        'completed_at', 'cancelled_at', 'cancellation_reason',
        'feedback', 'rating', 'notes', 'metadata',
        // TCK-590 — d'où vient la demande, et dans quelle langue prévenir un visiteur sans compte.
        'source', 'medium', 'locale',
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
        'visitor_name', 'visitor_phone', 'visitor_email',
        'type', 'status', 'scheduled_at', 'completed_at', 'duration_minutes',
        'cancelled_at', 'cancellation_reason', 'feedback', 'rating', 'notes', 'metadata',
        'source', 'medium', 'locale',
        'created_at', 'updated_at',
    ];

    /**
     * TCK-590 — `filter[unassigned]=1` : les visites sans agent, à prendre en charge ;
     * `filter[mine]=1` : celles dont je suis l'agent.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function getAllowedQueryFilters(): array
    {
        $filters = parent::getAllowedQueryFilters();

        $filters[] = AllowedFilter::callback('unassigned', function (Builder $q, mixed $value) {
            if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                $q->whereNull('agent_id');
            }
        });

        $filters[] = AllowedFilter::callback('mine', function (Builder $q, mixed $value) {
            $userId = request()->user()?->id;
            if (filter_var($value, FILTER_VALIDATE_BOOLEAN) && $userId !== null) {
                $q->where('agent_id', $userId);
            }
        });

        return $filters;
    }

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
