<?php

namespace App\Services\Dashboard;

use App\Models\Agency;
use App\Models\KpiConfig;

/**
 * Flattens DashboardAgencyService::summary() → simple
 * metric_key => numeric_value map. Used by:
 *   - the agency dashboard tiles configured in `kpi_configs` (TCK-2373, {@see self::configuredTiles()}).
 *   - ThresholdAlert evaluation (CheckThresholdAlertsCommand).
 */
class KpiResolver
{
    public function __construct(private readonly DashboardAgencyService $agencyService) {}

    /**
     * `occupancy_rate_percent` est `null` sans bien éligible (TCK-1114), et `unpaid_rate_percent` sans
     * échéance échue sur 12 mois (TCK-1177) : ils n'ont pas de dénominateur.
     *
     * @return array<string, float|int|null>
     */
    public function forAgency(Agency $agency): array
    {
        return self::flatten($this->agencyService->summary($agency));
    }

    /**
     * @param  array<string, mixed>  $s  le résumé de {@see DashboardAgencyService::summary()}
     * @return array<string, float|int|null>
     */
    public static function flatten(array $s): array
    {
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
            'unpaid_rate_percent' => $s['finance']['unpaid_rate_percent'] ?? null,
            'occupancy_rate_percent' => $s['occupancy']['rate_percent'] ?? null,
        ];
    }

    /**
     * TCK-2373 (P249.02) — les tuiles que l'agence a configurées dans l'écran « Indicateurs » : les
     * seules activées, par `sort_order` puis `id`, avec leur libellé, leur format et la valeur lue
     * dans le résumé déjà calculé (une requête de plus, constante). Une métrique hors de
     * {@see self::flatten()} n'a pas de valeur servie : elle est omise, jamais rendue à zéro.
     * Liste vide sans configuration : le tableau de bord garde alors ses tuiles par défaut.
     *
     * @param  array<string, mixed>  $summary
     * @return list<array{metric: string, label: string, format: string, value: float|int|null}>
     */
    public static function configuredTiles(Agency $agency, array $summary): array
    {
        $values = self::flatten($summary);

        return KpiConfig::query()
            ->where('agency_id', $agency->id)
            ->where('is_enabled', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['metric', 'label', 'format'])
            ->filter(fn (KpiConfig $config): bool => array_key_exists($config->metric, $values))
            ->map(fn (KpiConfig $config): array => [
                'metric' => $config->metric,
                'label' => $config->label,
                'format' => $config->format,
                'value' => $values[$config->metric],
            ])
            ->values()
            ->all();
    }
}
