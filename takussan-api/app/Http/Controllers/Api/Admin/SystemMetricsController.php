<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Models\PlatformMetricDaily;
use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Http\JsonResponse;

/**
 * TCK-144 — Cross-tenant KPIs for the super-admin dashboard. Single endpoint
 * (no fan-out) returning the four blocks the platform console needs:
 * agencies, users, properties and revenue.
 *
 * TCK-360 — le bloc `trend` : le point de comparaison à J-30, et RIEN d'autre. Le calcul de la
 * variation appartient au front ; l'API rend la valeur qu'avait la métrique à la coupure, ou rien.
 *
 * TCK-595 (ADR-0057 §4) — ce point se lit dans l'instantané quotidien `platform_metrics_daily` du
 * jour J-30, et NULLE PART ailleurs. Chaque colonne non nulle de cette ligne donne sa clé ; une
 * colonne nulle (ligne rattrapée) ou l'absence de ligne n'en donne aucune. La reconstruction de
 * TCK-360 depuis `created_at` et `paid_at` est retirée : une tuile et sa tendance suivaient deux
 * règles. Conséquence assumée : aucune tendance pendant les trente jours qui suivent le déploiement.
 *
 * Le bloc `revenue` suit l'*Encaissé* (`CollectedPayments`) : loyers de revenu et réservations nettes
 * de remboursement, jamais un dépôt de garantie ni sa restitution. `platform_total_paid` reprend
 * `collected_total` le temps que le front migre.
 */
class SystemMetricsController extends Controller
{
    /** Fenêtre de comparaison, en jours. Alignée sur le « delta 30 jours » de l'accueil. */
    private const TREND_PERIOD_DAYS = 30;

    /** Colonne de l'instantané → clé de `trend.previous`. */
    private const TREND_KEYS = [
        'agencies_total' => 'agencies_total',
        'agencies_active' => 'agencies_active',
        'agencies_verified' => 'agencies_verified',
        'agencies_suspended' => 'agencies_suspended',
        'users_total' => 'users_total',
        'users_active' => 'users_active',
        'properties_published' => 'properties_published',
        'properties_pending_review' => 'properties_pending_review',
        'leases_active' => 'leases_active',
        'collected_total_amount' => 'revenue_collected_total',
        'mrr_amount' => 'revenue_mrr',
        'mrr_trialing_amount' => 'revenue_mrr_trialing',
    ];

    public function __construct(private readonly PlatformMetricsSnapshotter $metrics) {}

    public function index(): JsonResponse
    {
        $stocks = $this->metrics->stocks(now());
        $flows = $this->metrics->flowsBetween(now()->subDays(PlatformMetricsSnapshotter::WINDOW_DAYS), now());
        $collected = $this->metrics->collectedTotal();
        $totalAgencies = (int) $stocks['agencies_total'];

        return $this->json([
            'data' => [
                'agencies' => [
                    'total' => $totalAgencies,
                    'verified' => $stocks['agencies_verified'],
                    'active' => $stocks['agencies_active'],
                    'suspended' => $stocks['agencies_suspended'],
                    'verification_rate' => $totalAgencies > 0
                        ? round($stocks['agencies_verified'] / $totalAgencies, 4)
                        : 0.0,
                ],
                'users' => [
                    'total' => $stocks['users_total'],
                    'active' => $stocks['users_active'],
                ],
                'properties' => [
                    'published' => $stocks['properties_published'],
                    'pending_review' => $stocks['properties_pending_review'],
                ],
                'leases' => [
                    'active' => $stocks['leases_active'],
                ],
                'revenue' => [
                    'collected_total' => $collected,
                    // Transition : même valeur que `collected_total`, retirée quand le front l'aura quittée.
                    'platform_total_paid' => $collected,
                    'gmv_30d' => $flows['gmv'],
                    'platform_fees_30d' => $flows['fees'],
                    'take_rate' => PlatformMetricsSnapshotter::takeRate($flows['gmv'], $flows['fees']),
                    'mrr' => $stocks['mrr_amount'],
                    'mrr_trialing' => $stocks['mrr_trialing_amount'],
                    'active_subscriptions' => $stocks['active_subscriptions'],
                    'currency' => 'XOF',
                ],
                'trend' => $this->trend(),
                'generated_at' => now()->toIso8601String(),
            ],
        ]);
    }

    /**
     * Le point de comparaison à J-30, lu dans l'instantané de ce jour-là — une clé par colonne
     * mesurée. Une clé absente est un contrat : « pas de point de comparaison ».
     *
     * @return array<string, mixed>
     */
    private function trend(): array
    {
        $cutoff = now()->subDays(self::TREND_PERIOD_DAYS);
        $snapshot = PlatformMetricDaily::query()->whereDate('date', $cutoff->toDateString())->first();

        $previous = [];
        foreach (self::TREND_KEYS as $column => $key) {
            $value = $snapshot?->getAttribute($column);
            if ($value !== null) {
                $previous[$key] = str_ends_with($column, '_amount') ? (float) $value : (int) $value;
            }
        }

        return [
            'period_days' => self::TREND_PERIOD_DAYS,
            'since' => $cutoff->toIso8601String(),
            'previous' => $previous,
        ];
    }
}
