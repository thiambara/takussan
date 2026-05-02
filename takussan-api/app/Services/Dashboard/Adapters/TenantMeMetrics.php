<?php

namespace App\Services\Dashboard\Adapters;

use App\Contracts\DashboardMetrics;
use App\Models\User;
use App\Services\Dashboard\DashboardTenantService;

class TenantMeMetrics implements DashboardMetrics
{
    public function __construct(private readonly DashboardTenantService $service) {}

    public function role(): string
    {
        return 'tenant';
    }

    public function metrics(User $user): array
    {
        $s = $this->service->summary($user);

        return [
            'has_customer_profile' => $s['has_customer_profile'] ?? false,
            'leases_active' => $s['leases']['active'] ?? 0,
            'bookings_pending' => $s['bookings']['pending'] ?? 0,
            'next_payment' => $s['payments']['next_due'] ?? null,
            'upcoming_payments' => $s['payments']['upcoming_30d'] ?? [],
            'overdue_count' => $s['payments']['overdue_count'] ?? 0,
            'overdue_amount' => $s['payments']['overdue_amount'] ?? 0.0,
            'maintenance_open' => $s['maintenance']['open'] ?? 0,
            'recent_documents' => $s['documents']['recent'] ?? [],
        ];
    }

    public function sections(User $user): array
    {
        return ['lease', 'payments', 'documents'];
    }
}
