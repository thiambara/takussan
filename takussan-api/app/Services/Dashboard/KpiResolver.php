<?php

namespace App\Services\Dashboard;

use App\Models\Agency;

/**
 * Flattens DashboardAgencyService::summary() → simple
 * metric_key => numeric_value map. Used by:
 *   - KpiConfig frontend rendering (labels + values).
 *   - ThresholdAlert evaluation (CheckThresholdAlertsCommand).
 */
class KpiResolver
{
    public function __construct(private readonly DashboardAgencyService $agencyService) {}

    /**
     * @return array<string, float|int>
     */
    public function forAgency(Agency $agency): array
    {
        $s = $this->agencyService->summary($agency);

        return [
            'properties_total' => $s['properties']['total'] ?? 0,
            'properties_rented' => $s['properties']['rented'] ?? 0,
            'properties_available' => $s['properties']['available'] ?? 0,
            'leases_active' => $s['leases']['active'] ?? 0,
            'customers_count' => $s['customers_count'] ?? 0,
            'members_count' => $s['members_count'] ?? 0,
            'bookings_pending' => $s['bookings']['pending'] ?? 0,
            'maintenance_open' => $s['maintenance']['open'] ?? 0,
            'revenue_month' => $s['finance']['revenue_month'] ?? 0.0,
            'commission_month' => $s['finance']['commission_month'] ?? 0.0,
            'overdue_count' => $s['finance']['overdue_count'] ?? 0,
            'overdue_amount' => $s['finance']['overdue_amount'] ?? 0.0,
            'unpaid_rate_percent' => $s['finance']['unpaid_rate_percent'] ?? 0.0,
            'occupancy_rate_percent' => $s['occupancy']['rate_percent'] ?? 0.0,
        ];
    }
}
