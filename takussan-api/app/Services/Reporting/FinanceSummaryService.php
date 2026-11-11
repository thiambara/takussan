<?php

namespace App\Services\Reporting;

use App\Models\Agency;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Invoice;
use App\Models\Payout;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Dashboard\PortfolioMetrics;
use App\Services\Dashboard\PortfolioScope;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2657 (ADR-0100 § 4) — le point de l'argent d'une agence pour un mois civil : ce qui est
 * encaissé (et le mois d'avant), ce qui est en retard, les cautions détenues, les reversements qui
 * attendent et les factures en brouillon. Seulement des nombres et des codes : le front écrit le
 * texte (principe 5).
 *
 * Aucune règle n'est réécrite ici, elles sont lues :
 * - *Encaissé* = {@see CollectedPayments} (loyers d'un type de revenu, pénalités réglées datées par
 *   `late_fee_paid_at`, réservations), sur le périmètre de la tuile de l'accueil
 *   ({@see PortfolioScope::agency()}) : le mois courant rend `finance.revenue_month` de
 *   `GET /api/dashboard/agency`. Le compte est celui des PAIEMENTS (loyers et réservations) ; une
 *   pénalité réglée ajoute son montant sans compter un paiement de plus.
 * - *Impayé* = la règle de la balance âgée ({@see AgingBalanceService}) et de la tuile « Impayés »
 *   (échéance due, échue AVANT aujourd'hui, au reste dû), répartie en trois tranches de retard.
 *   C'est un état À DATE (`as_of`), quel que soit le mois demandé : le statut d'une échéance est
 *   celui d'aujourd'hui, l'impayé d'un mois passé ne se reconstitue pas.
 *
 * Le mois se lit à l'heure de Dakar ; ses bornes sont converties dans le fuseau de l'application
 * (celui des horodatages en base) avant d'atteindre la requête.
 */
class FinanceSummaryService
{
    public const TIMEZONE = 'Africa/Dakar';

    /** Tranches de retard, en jours (bornes incluses), dans l'ordre d'affichage. */
    public const AGE_BUCKETS = [
        'under_8' => [1, 7],
        'from_8_to_30' => [8, 30],
        'over_30' => [31, null],
    ];

    public function __construct(private readonly PortfolioMetrics $metrics) {}

    /** Le mois courant, à l'heure de Dakar, en `YYYY-MM`. */
    public static function currentPeriod(): string
    {
        return now(self::TIMEZONE)->format('Y-m');
    }

    /** @return array<string, mixed> */
    public function forAgency(Agency $agency, string $period): array
    {
        $scope = PortfolioScope::agency((int) $agency->id);
        $monthStart = CarbonImmutable::createFromFormat('!Y-m', $period, self::TIMEZONE);
        $collected = $this->collected(
            $scope,
            $monthStart->subMonthNoOverflow(),
            $monthStart,
            $monthStart->addMonthNoOverflow(),
        );

        return [
            'period' => $period,
            'as_of' => now(self::TIMEZONE)->toDateString(),
            'currency' => $agency->currency?->value,
            'collected' => $collected,
            'overdue' => $this->overdue($scope),
            'deposits_held' => $this->metrics->depositsHeld($scope),
            ...$this->payouts((int) $agency->id),
            'invoices_draft' => $this->draftInvoices((int) $agency->id),
        ];
    }

    /**
     * L'encaissé du mois `[$from, $to[` et celui du mois d'avant `[$previous, $from[`, en une requête.
     *
     * @return array{amount: float, count: int, previous_amount: float}
     */
    private function collected(PortfolioScope $scope, CarbonImmutable $previous, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $appTz = config('app.timezone');
        [$previous, $from, $to] = array_map(fn (CarbonImmutable $d) => $d->setTimezone($appTz), [$previous, $from, $to]);

        $ofLeases = fn (Builder $q): Builder => $q
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where(fn (Builder $q) => $scope->leases($q));
        $slice = fn (Builder $q, string $column, string $value, int $counts) => $q
            ->where($column, '>=', $previous)
            ->where($column, '<', $to)
            ->selectRaw("CASE WHEN {$column} >= ? THEN 'current' ELSE 'previous' END AS p, {$value} AS v, {$counts} AS n", [$from])
            ->toBase();

        $rents = $slice($ofLeases(CollectedPayments::leaseIncome()), 'lease_payments.paid_at', CollectedPayments::LEASE_NET_SQL, 1);
        $lateFees = $slice($ofLeases(CollectedPayments::lateFeeIncome()), 'lease_payments.late_fee_paid_at', CollectedPayments::LATE_FEE_NET_SQL, 0);
        $bookings = $slice(
            CollectedPayments::bookingIncome()
                ->join('bookings', 'bookings.id', '=', 'booking_payments.booking_id')
                ->join('properties', 'properties.id', '=', 'bookings.property_id')
                ->whereNull('bookings.deleted_at')
                ->where(fn (Builder $q) => $scope->properties($q)),
            'booking_payments.paid_at',
            CollectedPayments::BOOKING_NET_SQL,
            1,
        );

        $rows = DB::query()
            ->fromSub($rents->unionAll($lateFees)->unionAll($bookings), 'collected')
            ->selectRaw('p, COALESCE(SUM(v), 0) AS total, COALESCE(SUM(n), 0) AS n')
            ->groupBy('p')
            ->get()
            ->keyBy('p');

        return [
            'amount' => round((float) ($rows['current']->total ?? 0), 2),
            'count' => (int) ($rows['current']->n ?? 0),
            'previous_amount' => round((float) ($rows['previous']->total ?? 0), 2),
        ];
    }

    /**
     * @return array{amount: float, count: int, leases_count: int, by_age: array<string, array{count: int, amount: float}>}
     */
    private function overdue(PortfolioScope $scope): array
    {
        $today = now(self::TIMEZONE)->toDateString();
        $query = CollectedPayments::leaseOwed()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where(fn (Builder $q) => $scope->leases($q))
            ->whereDate('lease_payments.due_date', '<', $today)
            ->toBase()
            ->selectRaw('COUNT(*) AS n, COALESCE(SUM('.CollectedPayments::OWED_REMAINING_SQL.'), 0) AS total')
            ->selectRaw('COUNT(DISTINCT lease_payments.lease_id) AS leases');

        foreach (self::AGE_BUCKETS as $key => [$min, $max]) {
            $condition = $max === null
                ? "(?::date - lease_payments.due_date) >= {$min}"
                : "(?::date - lease_payments.due_date) BETWEEN {$min} AND {$max}";
            $query->selectRaw("COUNT(*) FILTER (WHERE {$condition}) AS {$key}_n", [$today]);
            $query->selectRaw('COALESCE(SUM('.CollectedPayments::OWED_REMAINING_SQL.") FILTER (WHERE {$condition}), 0) AS {$key}_total", [$today]);
        }

        $row = $query->first();
        $byAge = [];
        foreach (array_keys(self::AGE_BUCKETS) as $key) {
            $byAge[$key] = [
                'count' => (int) $row->{"{$key}_n"},
                'amount' => round((float) $row->{"{$key}_total"}, 2),
            ];
        }

        return [
            'amount' => round((float) $row->total, 2),
            'count' => (int) $row->n,
            'leases_count' => (int) $row->leases,
            'by_age' => $byAge,
        ];
    }

    /**
     * Les reversements de l'agence qui attendent une approbation (ADR-0039 § 4), et ceux qui
     * attendent d'être versés (`pending`, la tuile d'aujourd'hui), au net.
     *
     * @return array{payouts_awaiting_approval: array{count: int, amount: float, landlords_count: int}, payouts_pending: array{count: int, amount: float}}
     */
    private function payouts(int $agencyId): array
    {
        $awaiting = PayoutStatus::AwaitingApproval->value;
        $pending = PayoutStatus::Pending->value;

        $row = Payout::query()
            ->where('agency_id', $agencyId)
            ->whereIn('status', [$awaiting, $pending])
            ->toBase()
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS awaiting_n', [$awaiting])
            ->selectRaw('COALESCE(SUM(net_amount) FILTER (WHERE status = ?), 0) AS awaiting_total', [$awaiting])
            ->selectRaw('COUNT(DISTINCT landlord_id) FILTER (WHERE status = ?) AS awaiting_landlords', [$awaiting])
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS pending_n', [$pending])
            ->selectRaw('COALESCE(SUM(net_amount) FILTER (WHERE status = ?), 0) AS pending_total', [$pending])
            ->first();

        return [
            'payouts_awaiting_approval' => [
                'count' => (int) $row->awaiting_n,
                'amount' => round((float) $row->awaiting_total, 2),
                'landlords_count' => (int) $row->awaiting_landlords,
            ],
            'payouts_pending' => [
                'count' => (int) $row->pending_n,
                'amount' => round((float) $row->pending_total, 2),
            ],
        ];
    }

    /** @return array{count: int, amount: float} */
    private function draftInvoices(int $agencyId): array
    {
        $row = Invoice::query()
            ->where('agency_id', $agencyId)
            ->where('status', InvoiceStatus::Draft->value)
            ->toBase()
            ->selectRaw('COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS total')
            ->first();

        return ['count' => (int) $row->n, 'amount' => round((float) $row->total, 2)];
    }
}
