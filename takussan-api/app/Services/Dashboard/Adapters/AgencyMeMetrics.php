<?php

namespace App\Services\Dashboard\Adapters;

use App\Contracts\DashboardMetrics;
use App\Models\Agency;
use App\Models\User;
use App\Services\Dashboard\KpiResolver;

class AgencyMeMetrics implements DashboardMetrics
{
    public function __construct(private readonly KpiResolver $kpis) {}

    public function role(): string
    {
        return 'agency_admin';
    }

    public function metrics(User $user): array
    {
        $agency = $user->agency_id ? Agency::find($user->agency_id) : null;

        return $agency ? $this->kpis->forAgency($agency) : [];
    }

    public function sections(User $user): array
    {
        return ['portfolio', 'revenue', 'payments', 'agents'];
    }
}
