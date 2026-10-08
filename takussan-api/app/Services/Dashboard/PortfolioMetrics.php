<?php

namespace App\Services\Dashboard;

use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\LeasePayment;
use App\Models\Payout;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-595 — les chiffres d'un portefeuille (bailleur ou agence), sur les règles de calcul du ticket.
 *
 * **Un chiffre ne se reconstruit pas depuis un statut courant.** L'occupation d'un mois passé se lit
 * dans les DATES des baux et des réservations : un bail `expired`, `terminated` ou `renewed` occupe
 * encore les mois où il courait. L'ancien calcul comptait les baux `active` d'aujourd'hui, et janvier
 * valait 0 pour un bail terminé en juin.
 *
 * Chaque méthode est UNE requête, quel que soit le nombre de mois, de biens ou de baux : la série
 * mensuelle coûtait 1 + 2 × mois requêtes (34 pour 12 mois), et aucun tableau de bord n'a de cache
 * (un tableau de bord en cache ment après un paiement).
 *
 * Règles :
 * - *Biens éligibles* : feuilles (sans enfant), `contract_type = rent`, hors brouillon, archivé, en
 *   revue, refusé, vendu, créés avant la fin du mois mesuré. Longue durée = `rent_period` mensuel ou
 *   annuel ; courte durée = journalier ou hebdomadaire.
 * - *Occupation longue durée* = jours-biens couverts par un bail hors `draft` et `pending_signature`
 *   ÷ (biens éligibles × jours du mois). Fin effective = la plus tôt de `end_date` et `terminated_at`,
 *   incluse. Un jour d'un bien ne compte qu'une fois, même sous deux baux.
 * - *Occupation courte durée* = nuitées des réservations `confirmed | completed` (`end_date` exclue)
 *   ÷ (biens éligibles × jours du mois). `null` sans bien éligible.
 * - *Encaissé*, *Impayé* : {@see CollectedPayments}.
 * - *Net reversé* = Σ `payouts.net_amount` `completed`, par `processed_at`, `payee_role = landlord`
 *   (TCK-594) : une caution rendue au locataire n'est jamais un versement au bailleur.
 * - *Cautions détenues* = Σ `deposit` payés − Σ `deposit_refund` payés.
 */
class PortfolioMetrics
{
    private const EXCLUDED_PROPERTY_STATUSES = [
        PropertyStatus::Draft,
        PropertyStatus::Archived,
        PropertyStatus::PendingReview,
        PropertyStatus::Rejected,
        PropertyStatus::Sold,
    ];

    private const NON_OCCUPYING_LEASE_STATUSES = [LeaseStatus::Draft, LeaseStatus::PendingSignature];

    private const OCCUPYING_BOOKING_STATUSES = [BookingStatus::Confirmed, BookingStatus::Completed];

    /**
     * Occupation longue durée, mois par mois, de `$from` à `$to` inclus (mois calendaires).
     *
     * @return array<string, float> `Y-m` => pourcentage à 2 décimales
     */
    public function longStayOccupancy(PortfolioScope $scope, CarbonInterface $from, CarbonInterface $to): array
    {
        [$start, $end] = $this->monthBounds($from, $to);
        [$eligibleSql, $eligibleBindings] = $this->eligibleSql($scope, [RentPeriod::Monthly, RentPeriod::Yearly]);

        $sql = <<<SQL
            WITH eligible AS ({$eligibleSql}),
            months AS (
                SELECT generate_series(?::date, ?::date, interval '1 month')::date AS m
            ),
            denom AS (
                SELECT months.m, COUNT(e.id) AS n
                FROM months
                LEFT JOIN eligible e ON e.created_at < (months.m + interval '1 month')
                GROUP BY months.m
            ),
            covered_days AS (
                SELECT DISTINCT l.property_id, d::date AS d
                FROM leases l
                JOIN eligible e ON e.id = l.property_id
                CROSS JOIN LATERAL generate_series(
                    GREATEST(l.start_date, ?::date),
                    LEAST(l.end_date, l.terminated_at::date, ?::date),
                    interval '1 day'
                ) AS d
                WHERE l.deleted_at IS NULL
                  AND l.status NOT IN (?, ?)
                  AND e.created_at < (date_trunc('month', d) + interval '1 month')
            ),
            covered AS (
                SELECT date_trunc('month', d)::date AS m, COUNT(*) AS days
                FROM covered_days
                GROUP BY 1
            )
            SELECT denom.m, denom.n, COALESCE(covered.days, 0) AS days
            FROM denom
            LEFT JOIN covered ON covered.m = denom.m
            ORDER BY denom.m
            SQL;

        $rows = DB::select($sql, array_merge(
            $eligibleBindings,
            [$start->toDateString(), $end->startOfMonth()->toDateString()],
            [$start->toDateString(), $end->toDateString()],
            array_map(static fn (LeaseStatus $s): string => $s->value, self::NON_OCCUPYING_LEASE_STATUSES),
        ));

        $out = [];
        foreach ($rows as $row) {
            $month = CarbonImmutable::parse($row->m);
            $capacity = (int) $row->n * $month->daysInMonth;
            $out[$month->format('Y-m')] = $capacity > 0 ? round(((int) $row->days / $capacity) * 100, 2) : 0.0;
        }

        return $out;
    }

    /**
     * Occupation courte durée, mois par mois : nuitées réservées ÷ (biens éligibles × jours du mois).
     *
     * @return array<string, float|null> `Y-m` => pourcentage, ou `null` sans bien courte durée
     */
    public function shortStayOccupancy(PortfolioScope $scope, CarbonInterface $from, CarbonInterface $to): array
    {
        [$start, $end] = $this->monthBounds($from, $to);
        [$eligibleSql, $eligibleBindings] = $this->eligibleSql($scope, [RentPeriod::Daily, RentPeriod::Weekly]);

        $sql = <<<SQL
            WITH eligible AS ({$eligibleSql}),
            months AS (
                SELECT generate_series(?::date, ?::date, interval '1 month')::date AS m
            ),
            denom AS (
                SELECT months.m, COUNT(e.id) AS n
                FROM months
                LEFT JOIN eligible e ON e.created_at < (months.m + interval '1 month')
                GROUP BY months.m
            ),
            nights AS (
                SELECT DISTINCT b.property_id, d::date AS d
                FROM bookings b
                JOIN eligible e ON e.id = b.property_id
                CROSS JOIN LATERAL generate_series(
                    GREATEST(b.start_date, ?::date),
                    LEAST(b.end_date - 1, ?::date),
                    interval '1 day'
                ) AS d
                WHERE b.deleted_at IS NULL
                  AND b.status IN (?, ?)
                  AND e.created_at < (date_trunc('month', d) + interval '1 month')
            ),
            covered AS (
                SELECT date_trunc('month', d)::date AS m, COUNT(*) AS nights
                FROM nights
                GROUP BY 1
            )
            SELECT denom.m, denom.n, COALESCE(covered.nights, 0) AS nights
            FROM denom
            LEFT JOIN covered ON covered.m = denom.m
            ORDER BY denom.m
            SQL;

        $rows = DB::select($sql, array_merge(
            $eligibleBindings,
            [$start->toDateString(), $end->startOfMonth()->toDateString()],
            [$start->toDateString(), $end->toDateString()],
            array_map(static fn (BookingStatus $s): string => $s->value, self::OCCUPYING_BOOKING_STATUSES),
        ));

        $out = [];
        foreach ($rows as $row) {
            $month = CarbonImmutable::parse($row->m);
            $capacity = (int) $row->n * $month->daysInMonth;
            $out[$month->format('Y-m')] = $capacity > 0 ? round(((int) $row->nights / $capacity) * 100, 2) : null;
        }

        return $out;
    }

    /** Occupation longue durée AUJOURD'HUI : biens éligibles couverts par un bail ce jour-là. */
    public function longStayOccupancyToday(PortfolioScope $scope): float
    {
        [$eligibleSql, $eligibleBindings] = $this->eligibleSql($scope, [RentPeriod::Monthly, RentPeriod::Yearly]);
        $today = now()->toDateString();

        $sql = <<<SQL
            WITH eligible AS ({$eligibleSql})
            SELECT
                COUNT(*) AS n,
                COUNT(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM leases l
                    WHERE l.property_id = e.id
                      AND l.deleted_at IS NULL
                      AND l.status NOT IN (?, ?)
                      AND l.start_date <= ?::date
                      AND COALESCE(LEAST(l.end_date, l.terminated_at::date), ?::date) >= ?::date
                )) AS occupied
            FROM eligible e
            WHERE e.created_at <= ?
            SQL;

        $row = DB::selectOne($sql, array_merge(
            $eligibleBindings,
            array_map(static fn (LeaseStatus $s): string => $s->value, self::NON_OCCUPYING_LEASE_STATUSES),
            [$today, $today, $today, now()],
        ));

        $n = (int) ($row->n ?? 0);

        return $n > 0 ? round(((int) $row->occupied / $n) * 100, 2) : 0.0;
    }

    /**
     * Loyers encaissés par mois (`paid_at`), types revenu seulement.
     *
     * @return array<string, float>
     */
    public function leaseIncomeByMonth(PortfolioScope $scope, CarbonInterface $from, CarbonInterface $to): array
    {
        [$start, $end] = $this->monthBounds($from, $to);

        $rows = CollectedPayments::leaseIncome()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.'.$scope->leaseColumn, $scope->id)
            ->whereBetween('lease_payments.paid_at', [$start->startOfDay(), $end->endOfDay()])
            ->selectRaw("to_char(date_trunc('month', lease_payments.paid_at), 'YYYY-MM') AS m, SUM(lease_payments.amount) AS total")
            ->groupBy('m')
            ->pluck('total', 'm');

        return $this->fillMonths($start, $end, $rows->all());
    }

    /**
     * Réservations encaissées par mois (`paid_at`), montant − remboursement.
     *
     * @return array<string, float>
     */
    public function bookingIncomeByMonth(PortfolioScope $scope, CarbonInterface $from, CarbonInterface $to): array
    {
        [$start, $end] = $this->monthBounds($from, $to);

        $rows = CollectedPayments::bookingIncome()
            ->join('bookings', 'bookings.id', '=', 'booking_payments.booking_id')
            ->join('properties', 'properties.id', '=', 'bookings.property_id')
            ->whereNull('bookings.deleted_at')
            ->where('properties.'.$scope->propertyColumn, $scope->id)
            ->whereBetween('booking_payments.paid_at', [$start->startOfDay(), $end->endOfDay()])
            ->selectRaw("to_char(date_trunc('month', booking_payments.paid_at), 'YYYY-MM') AS m, SUM(".CollectedPayments::BOOKING_NET_SQL.') AS total')
            ->groupBy('m')
            ->pluck('total', 'm');

        return $this->fillMonths($start, $end, $rows->all());
    }

    /**
     * Net reversé au bailleur par mois (`processed_at`).
     *
     * @return array<string, float>
     */
    public function netPaidOutByMonth(PortfolioScope $scope, CarbonInterface $from, CarbonInterface $to): array
    {
        [$start, $end] = $this->monthBounds($from, $to);

        $rows = Payout::query()
            ->where('payouts.'.$scope->payoutColumn, $scope->id)
            ->where('payouts.status', PayoutStatus::Completed->value)
            ->where('payouts.payee_role', PayeeRole::Landlord->value)
            ->whereBetween('payouts.processed_at', [$start->startOfDay(), $end->endOfDay()])
            ->selectRaw("to_char(date_trunc('month', payouts.processed_at), 'YYYY-MM') AS m, SUM(payouts.net_amount) AS total")
            ->groupBy('m')
            ->pluck('total', 'm');

        return $this->fillMonths($start, $end, $rows->all());
    }

    /** Cautions détenues : dépôts payés − restitutions payées, sur tous les baux du périmètre. */
    public function depositsHeld(PortfolioScope $scope): float
    {
        $value = LeasePayment::query()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.'.$scope->leaseColumn, $scope->id)
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->whereIn('lease_payments.payment_type', [LeasePaymentType::Deposit->value, LeasePaymentType::DepositRefund->value])
            ->selectRaw('COALESCE(SUM(CASE WHEN lease_payments.payment_type = ? THEN lease_payments.amount ELSE -lease_payments.amount END), 0) AS held', [LeasePaymentType::Deposit->value])
            ->value('held');

        return round((float) $value, 2);
    }

    /**
     * Impayés à date : échéances `pending | partially_paid | late` échues, hors restitution de caution,
     * comptées au reste dû.
     *
     * @return array{count: int, amount: float}
     */
    public function overdue(PortfolioScope $scope): array
    {
        $row = CollectedPayments::leaseOwed()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.'.$scope->leaseColumn, $scope->id)
            ->whereDate('lease_payments.due_date', '<', now()->toDateString())
            ->selectRaw('COUNT(*) AS n, COALESCE(SUM('.CollectedPayments::OWED_REMAINING_SQL.'), 0) AS total')
            ->toBase()
            ->first();

        return ['count' => (int) ($row->n ?? 0), 'amount' => round((float) ($row->total ?? 0), 2)];
    }

    /**
     * La requête des biens « éligibles » du périmètre, pour un ensemble de périodicités.
     *
     * @param  list<RentPeriod>  $periods
     * @return array{0: string, 1: list<mixed>}
     */
    private function eligibleSql(PortfolioScope $scope, array $periods): array
    {
        $statusPlaceholders = implode(', ', array_fill(0, count(self::EXCLUDED_PROPERTY_STATUSES), '?'));
        $periodPlaceholders = implode(', ', array_fill(0, count($periods), '?'));
        $column = $scope->propertyColumn;

        $sql = <<<SQL
            SELECT p.id, p.created_at
            FROM properties p
            WHERE p.deleted_at IS NULL
              AND p.{$column} = ?
              AND p.contract_type = ?
              AND p.rent_period IN ({$periodPlaceholders})
              AND p.status NOT IN ({$statusPlaceholders})
              AND NOT EXISTS (
                  SELECT 1 FROM properties c WHERE c.parent_id = p.id AND c.deleted_at IS NULL
              )
            SQL;

        return [$sql, array_merge(
            [$scope->id, ContractType::Rent->value],
            array_map(static fn (RentPeriod $p): string => $p->value, $periods),
            array_map(static fn (PropertyStatus $s): string => $s->value, self::EXCLUDED_PROPERTY_STATUSES),
        )];
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} premier jour du premier mois, dernier jour du dernier */
    private function monthBounds(CarbonInterface $from, CarbonInterface $to): array
    {
        return [
            CarbonImmutable::parse($from->toDateString())->startOfMonth(),
            CarbonImmutable::parse($to->toDateString())->endOfMonth()->startOfDay(),
        ];
    }

    /**
     * @param  array<string, mixed>  $totals
     * @return array<string, float>
     */
    private function fillMonths(CarbonImmutable $start, CarbonImmutable $end, array $totals): array
    {
        $out = [];
        for ($cursor = $start; $cursor->lessThanOrEqualTo($end); $cursor = $cursor->addMonthNoOverflow()) {
            $key = $cursor->format('Y-m');
            $out[$key] = round((float) ($totals[$key] ?? 0), 2);
        }

        return $out;
    }
}
