<?php

namespace App\Services\Dashboard\Adapters;

use App\Contracts\DashboardMetrics;
use App\Models\User;
use App\Services\Dashboard\DashboardOwnerService;

class OwnerMeMetrics implements DashboardMetrics
{
    public function __construct(private readonly DashboardOwnerService $service) {}

    public function role(): string
    {
        return 'owner';
    }

    public function metrics(User $user): array
    {
        $s = $this->service->summary($user);

        return [
            'portfolio_total' => $s['portfolio']['total'] ?? 0,
            'portfolio_rented' => $s['portfolio']['rented'] ?? 0,
            'portfolio_available' => $s['portfolio']['available'] ?? 0,
            'leases_active' => $s['leases']['active'] ?? 0,
            'bookings_pending' => $s['bookings']['pending'] ?? 0,
            'cashflow_month' => $s['finance']['cashflow_month'] ?? 0.0,
            'expected_monthly' => $s['finance']['expected_monthly'] ?? 0.0,
            'overdue_count' => $s['finance']['overdue_count'] ?? 0,
            'overdue_amount' => $s['finance']['overdue_amount'] ?? 0.0,
            'occupancy_rate_percent' => $s['occupancy']['rate_percent'] ?? 0.0,
        ];
    }

    public function sections(User $user): array
    {
        return ['portfolio', 'cashflow', 'payouts'];
    }
}
