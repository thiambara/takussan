<?php

namespace App\Services\Reporting;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Lease;
use App\Models\PlatformMetricDaily;
use App\Models\Property;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * TCK-595 (ADR-0057) — les métriques de la console plateforme : mesure courante et instantané du jour.
 *
 * Flux (rattrapables, datés par `paid_at`) : GMV = l'*Encaissé* de la fenêtre
 * ({@see CollectedPayments}), frais = Σ montant × `platform_fee_pct_at_payment` / 100. Stocks (jamais
 * rattrapés) : comptes par statut courant et revenu d'abonnement
 * ({@see PlatformReportingService::subscriptionRevenueAt()}).
 *
 * `GET /api/admin/system/metrics` et l'instantané lisent ces mêmes méthodes : une tuile et sa
 * tendance ne peuvent pas suivre deux règles.
 */
class PlatformMetricsSnapshotter
{
    /** Fenêtre glissante du GMV, des frais et du take rate. */
    public const WINDOW_DAYS = 30;

    public function __construct(private readonly PlatformReportingService $reporting) {}

    /**
     * Encaissé et frais plateforme sur `[from, to]`, en deux requêtes (loyers, réservations).
     *
     * @return array{gmv: float, fees: float}
     */
    public function flowsBetween(?CarbonInterface $from, CarbonInterface $to): array
    {
        $lease = CollectedPayments::leaseIncome()
            ->when($from !== null, fn ($q) => $q->where('lease_payments.paid_at', '>=', $from))
            ->where('lease_payments.paid_at', '<=', $to)
            ->toBase()
            ->selectRaw('COALESCE(SUM(lease_payments.amount), 0) AS gmv, '
                .'COALESCE(SUM(lease_payments.amount * COALESCE(lease_payments.platform_fee_pct_at_payment, 0) / 100), 0) AS fees')
            ->first();

        $net = CollectedPayments::BOOKING_NET_SQL;
        $booking = CollectedPayments::bookingIncome()
            ->when($from !== null, fn ($q) => $q->where('booking_payments.paid_at', '>=', $from))
            ->where('booking_payments.paid_at', '<=', $to)
            ->toBase()
            ->selectRaw("COALESCE(SUM({$net}), 0) AS gmv, "
                ."COALESCE(SUM(({$net}) * COALESCE(booking_payments.platform_fee_pct_at_payment, 0) / 100), 0) AS fees")
            ->first();

        return [
            'gmv' => round((float) $lease->gmv + (float) $booking->gmv, 2),
            'fees' => round((float) $lease->fees + (float) $booking->fees, 2),
        ];
    }

    /**
     * L'*Encaissé* cumulé à l'instant : la règle de l'instantané (`collected_total_amount`), c'est-à-dire
     * les flux payés datés jusqu'à maintenant. verif-595 m4 — la tuile comptait aussi les paiements sans
     * `paid_at`, que l'instantané ne compte pas : la tendance affichait un écart sans aucun mouvement
     * (ADR-0057 : une seule règle pour la tuile et sa tendance).
     */
    public function collectedTotal(): float
    {
        return $this->flowsBetween(null, now())['gmv'];
    }

    /** Frais ÷ GMV, à 4 décimales ; `null` sans GMV (un taux sur zéro n'est pas zéro). */
    public static function takeRate(float $gmv, float $fees): ?float
    {
        return $gmv > 0 ? round($fees / $gmv, 4) : null;
    }

    /**
     * Les stocks à l'instant : comptes par statut courant, et revenu d'abonnement.
     *
     * @return array<string, int|float>
     */
    public function stocks(CarbonInterface $at): array
    {
        $revenue = $this->reporting->subscriptionRevenueAt($at);

        return [
            'mrr_amount' => $revenue['mrr'],
            'mrr_trialing_amount' => $revenue['mrr_trialing'],
            'active_subscriptions' => $revenue['active_subscriptions'],
            'agencies_total' => Agency::query()->count(),
            'agencies_active' => Agency::query()->where('status', AgencyStatus::Active)->count(),
            'agencies_verified' => Agency::query()->where('is_verified', true)->count(),
            'agencies_suspended' => Agency::query()->where('status', AgencyStatus::Suspended)->count(),
            'users_total' => User::query()->count(),
            'users_active' => User::query()->where('status', UserStatus::Active)->count(),
            'properties_published' => Property::query()->where('status', PropertyStatus::Published)->count(),
            'properties_pending_review' => Property::query()->where('status', PropertyStatus::PendingReview)->count(),
            'leases_active' => Lease::query()->where('status', LeaseStatus::Active)->count(),
        ];
    }

    /**
     * Écrit l'instantané de `$day`. Les flux toujours ; les stocks seulement si `$withStocks` (la
     * veille, mesurée à l'exécution). `upsert` sur `date`, qui ne réécrit que les colonnes mesurées :
     * un rattrapage n'efface jamais les stocks d'une ligne existante.
     */
    public function snapshot(CarbonInterface $day, bool $withStocks): PlatformMetricDaily
    {
        $start = Carbon::parse($day)->startOfDay();
        $end = $start->copy()->endOfDay();
        $flows = $this->flowsBetween($start, $end);

        $values = [
            'date' => $start->toDateString(),
            'gmv_amount' => $flows['gmv'],
            'platform_fees_amount' => $flows['fees'],
            'collected_total_amount' => $this->flowsBetween(null, $end)['gmv'],
        ];
        if ($withStocks) {
            $values += $this->stocks(now()) + ['stocks_captured_at' => now()];
        }

        $now = now();
        PlatformMetricDaily::query()->upsert(
            [$values + ['created_at' => $now, 'updated_at' => $now]],
            ['date'],
            [...array_keys(array_diff_key($values, ['date' => true])), 'updated_at'],
        );

        return PlatformMetricDaily::query()->whereDate('date', $start->toDateString())->firstOrFail();
    }
}
