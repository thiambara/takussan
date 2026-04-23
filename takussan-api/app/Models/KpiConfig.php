<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-agency dashboard KPI customization (TCK-032 P3).
 */
class KpiConfig extends AbstractModel
{
    protected $fillable = [
        'agency_id', 'metric', 'label', 'format',
        'sort_order', 'is_enabled', 'settings',
    ];

    protected $casts = [
        'sort_order' => 'integer',
        'is_enabled' => 'boolean',
        'settings' => 'array',
    ];

    protected static array $requestFilterable = ['agency_id', 'metric', 'is_enabled'];

    protected static array $requestSortable = ['id', 'sort_order', 'created_at'];

    protected static array $requestLoadable = ['agency'];

    protected static array $queryFields = [
        'id', 'agency_id', 'metric', 'label', 'format',
        'sort_order', 'is_enabled', 'created_at', 'updated_at',
    ];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    /**
     * Whitelist of metrics exposed to agencies. Keeping it small prevents
     * arbitrary SQL injection via the `metric` column and acts as a contract
     * between the API and the dashboard services.
     */
    public static function allowedMetrics(): array
    {
        return [
            'properties_total',
            'properties_rented',
            'properties_available',
            'leases_active',
            'customers_count',
            'members_count',
            'bookings_pending',
            'maintenance_open',
            'revenue_month',
            'commission_month',
            'overdue_count',
            'overdue_amount',
            'unpaid_rate_percent',
            'occupancy_rate_percent',
        ];
    }
}
