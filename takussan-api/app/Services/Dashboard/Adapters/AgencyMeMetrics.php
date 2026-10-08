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

    /**
     * TCK-595 (verif-595 M1) — les chiffres CONSOLIDÉS de l'agence (chiffre d'affaires, commissions,
     * impayés) ne sortent d'ici que sous `AgencyPolicy::viewReports`, comme `GET /api/dashboard/agency`.
     * Sans elle, l'accueil garde le portefeuille et l'activité, et ces clés sont absentes : ce chemin
     * rendait par `/dashboard/me` ce que la garde de l'endpoint d'agence refuse.
     */
    public const CONSOLIDATED_KEYS = ['revenue_month', 'commission_month', 'overdue_count', 'overdue_amount', 'unpaid_rate_percent'];

    public function metrics(User $user): array
    {
        $agency = $user->agency_id ? Agency::find($user->agency_id) : null;
        if ($agency === null) {
            return [];
        }

        $metrics = $this->kpis->forAgency($agency);

        return $user->can('viewReports', $agency)
            ? $metrics
            : array_diff_key($metrics, array_flip(self::CONSOLIDATED_KEYS));
    }

    public function sections(User $user): array
    {
        return ['portfolio', 'revenue', 'payments', 'agents'];
    }
}
