<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-agency alert rule for dashboard metrics (TCK-032 P3).
 */
class ThresholdAlert extends AbstractModel
{
    protected $fillable = [
        'agency_id', 'metric', 'operator', 'threshold',
        'severity', 'is_enabled', 'last_triggered_at', 'last_value',
        'cooldown_hours', 'settings',
    ];

    protected $casts = [
        'threshold' => 'decimal:4',
        'last_value' => 'decimal:4',
        'is_enabled' => 'boolean',
        'last_triggered_at' => 'datetime',
        'cooldown_hours' => 'integer',
        'settings' => 'array',
    ];

    protected static array $requestFilterable = ['agency_id', 'metric', 'severity', 'is_enabled'];

    protected static array $requestSortable = ['id', 'metric', 'severity', 'created_at'];

    protected static array $requestLoadable = ['agency'];

    protected static array $queryFields = [
        'id', 'agency_id', 'metric', 'operator', 'threshold',
        'severity', 'is_enabled', 'last_triggered_at', 'last_value',
        'cooldown_hours', 'created_at', 'updated_at',
    ];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public static function allowedMetrics(): array
    {
        return [
            'unpaid_rate_percent',
            'occupancy_rate_percent',
            'overdue_count',
            'overdue_amount',
            'bookings_pending',
            'maintenance_open',
        ];
    }

    public static function allowedOperators(): array
    {
        return ['>', '<', '>=', '<='];
    }

    public static function allowedSeverities(): array
    {
        return ['info', 'warning', 'critical'];
    }

    /**
     * Whether the given value should trigger this alert according to its
     * operator + threshold, accounting for the cooldown window.
     */
    public function shouldTrigger(float $value, ?\DateTimeInterface $now = null): bool
    {
        $crossed = match ($this->operator) {
            '>' => $value > (float) $this->threshold,
            '<' => $value < (float) $this->threshold,
            '>=' => $value >= (float) $this->threshold,
            '<=' => $value <= (float) $this->threshold,
            default => false,
        };

        if (! $crossed) {
            return false;
        }

        if ($this->last_triggered_at === null) {
            return true;
        }

        $now = $now ?? now();
        $hoursSince = abs(Carbon::parse($now)->diffInHours($this->last_triggered_at));

        return $hoursSince >= $this->cooldown_hours;
    }
}
