<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Payments\PaymentHistory;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * Owner-facing dashboard — portfolio KPIs scoped to the landlord's user id.
 *
 * TCK-595 — les chiffres sortent de {@see PortfolioMetrics}, le calcul partagé avec l'agence :
 * occupation par jours-biens et nuitées, encaissé hors dépôts et restitutions, réservations
 * comprises, net reversé au seul bailleur. Le nombre de requêtes ne dépend ni du nombre de mois, ni
 * du nombre de biens ou de baux (AC6).
 */
class DashboardOwnerService
{
    /** TCK-2623 — le mois des loyers se lit à l'heure de Dakar. */
    public const TIMEZONE = 'Africa/Dakar';

    public function __construct(private readonly PortfolioMetrics $metrics) {}

    /**
     * TCK-2791 — l'encaissé, le reversé, les loyers du mois (`rent_month`) et la courte durée suivent la période ;
     * le reste est l'état du jour, listé dans `period.as_of_today` — `expected_monthly` compris : c'est le loyer
     * des baux en cours AUJOURD'HUI.
     */
    public const ETATS_DU_JOUR = [
        'portfolio.total', 'portfolio.rented', 'portfolio.available', 'leases.active', 'bookings.pending',
        'finance.deposits_held', 'finance.expected_monthly', 'finance.overdue_count', 'finance.overdue_amount',
        'occupancy.rate_percent', 'occupancy.eligible_count', 'occupancy.occupied_count',
        'maintenance.quotes_pending', 'visits.to_confirm', 'reviews.unanswered',
    ];

    public function summary(User $owner, ?PeriodeDuTableauDeBord $periode = null): array
    {
        $periode ??= PeriodeDuTableauDeBord::moisEnCours();
        $monthStart = $periode->debut;
        $monthEnd = $periode->fin;
        $scope = PortfolioScope::landlord((int) $owner->id);
        // TCK-2275 (P232.01, P232.06) — les biens et les baux dont il est le bailleur au sens de
        // `BailleurDuBien`, comme `PortfolioScope::landlord` : ni ceux qu'il a saisis comme agent,
        // ni, bailleur d'une agence B, ceux d'une agence A où il n'est que personnel.
        $propertyIds = $scope->properties(Property::query()->select('id'));

        $portfolio = $scope->properties(Property::query())
            ->toBase()
            // P127.04 (TCK-1359) — un bien archivé ou vendu a quitté le portefeuille.
            ->selectRaw('COUNT(*) FILTER (WHERE status NOT IN (?, ?)) AS total', array_map(
                static fn (PropertyStatus $s): string => $s->value,
                Property::OUT_OF_PORTFOLIO_STATUSES,
            ))
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS rented', [PropertyStatus::Rented->value])
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS available', [PropertyStatus::Available->value])
            ->first();

        $leases = $scope->leases(Lease::query())
            // P162.02 (TCK-1714) — le bail en préavis reste en cours, son loyer est dû.
            ->whereIn('status', Lease::ONGOING_STATUSES)
            ->toBase()
            ->selectRaw('COUNT(*) AS active, COALESCE(SUM(monthly_rent), 0) AS expected')
            // TCK-2623 — les loyers du mois, lus DANS cette requête (sous-requêtes scalaires) : le budget
            // de requêtes de l'accueil du bailleur (`DashboardQueryBudgetTest`) ne bouge pas.
            ->tap(fn ($query) => $this->loyersDuMois($query, $scope, $periode))
            ->first();

        $pendingBookings = Booking::query()
            ->whereIn('property_id', $propertyIds)
            ->where('status', BookingStatus::Pending->value)
            ->count();

        $leaseIncome = $this->metrics->leaseIncomeByMonth($scope, $monthStart, $monthEnd);
        $bookingIncome = $this->metrics->bookingIncomeByMonth($scope, $monthStart, $monthEnd);
        $netPaidOut = $this->metrics->netPaidOutByMonth($scope, $monthStart, $monthEnd);
        $shortStay = $this->metrics->shortStayOccupancy($scope, $monthStart, $monthEnd);
        $occupancyToday = $this->metrics->longStayOccupancyToday($scope);
        $overdue = $this->metrics->overdue($scope);
        $month = $periode->mois();

        $leaseIncomeMonth = $leaseIncome[$month] ?? 0.0;
        $bookingIncomeMonth = $bookingIncome[$month] ?? 0.0;

        return [
            'owner_id' => $owner->id,
            'period' => $periode->enTete(self::ETATS_DU_JOUR),
            'portfolio' => [
                'total' => (int) $portfolio->total,
                'rented' => (int) $portfolio->rented,
                'available' => (int) $portfolio->available,
            ],
            'leases' => [
                'active' => (int) $leases->active,
            ],
            'bookings' => [
                'pending' => $pendingBookings,
            ],
            'finance' => [
                'cashflow_month' => round($leaseIncomeMonth + $bookingIncomeMonth, 2),
                'lease_income_month' => $leaseIncomeMonth,
                'booking_income_month' => $bookingIncomeMonth,
                'net_paid_out_month' => $netPaidOut[$month] ?? 0.0,
                'deposits_held' => $this->metrics->depositsHeld($scope),
                'expected_monthly' => round((float) $leases->expected, 2),
                'overdue_count' => $overdue['count'],
                'overdue_amount' => $overdue['amount'],
                'rent_month' => [
                    'received_count' => (int) $leases->rent_received_count,
                    'expected_count' => (int) $leases->rent_expected_count,
                    'received_amount' => round((float) $leases->rent_received_amount, 2),
                    // TCK-2774 — les non soldées du même mois, en retard ou à venir (`loyersDuMois`).
                    'overdue_count' => (int) $leases->rent_overdue_count,
                    'overdue_amount' => round((float) $leases->rent_overdue_amount, 2),
                    'upcoming_count' => (int) $leases->rent_upcoming_count,
                    'upcoming_amount' => round((float) $leases->rent_upcoming_amount, 2),
                ],
            ],
            // TCK-2626 — le taux du jour rendu avec sa base ; les clés d'avant gardent nom et sens.
            'occupancy' => [
                'rate_percent' => $occupancyToday['rate_percent'],
                'eligible_count' => $occupancyToday['eligible_count'],
                'occupied_count' => $occupancyToday['occupied_count'],
                'short_stay_percent' => $shortStay[$month] ?? null,
            ],
            'maintenance' => [
                'quotes_pending' => MaintenanceRequest::query()
                    ->whereIn('property_id', $propertyIds)
                    ->whereIn('status', MaintenanceStateMachine::AWAITING_QUOTE_DECISION)
                    ->count(),
            ],
            'visits' => [
                // TCK-590 n'a pas créé de statut « demandée » : une visite à confirmer est une visite
                // `scheduled` encore à venir (repli prescrit par le ticket).
                'to_confirm' => PropertyVisit::query()
                    ->whereIn('property_id', $propertyIds)
                    ->where('status', VisitStatus::Scheduled->value)
                    ->where('scheduled_at', '>=', now())
                    ->count(),
            ],
            'reviews' => [
                'unanswered' => Review::query()
                    ->where('reviewable_type', Property::class)
                    ->whereIn('reviewable_id', $propertyIds)
                    ->where('is_approved', true)
                    ->whereNull('reply_content')
                    ->count(),
            ],
        ];
    }

    /**
     * TCK-2623 — « Loyers de novembre : 8 reçus sur 14 ». Les échéances de LOYER (`rent`) des baux du
     * bailleur, quel que soit leur statut de bail, dont `due_date` tombe dans le mois servi (TCK-2791) à l'heure
     * de Dakar :
     *  - `expected_count` : toutes, hors annulées (une échéance remplacée par un renouvellement n'est
     *    plus due). Une échéance en échec de paiement (`failed`) reste attendue : elle repasse à payée ;
     *  - `received_count` / `received_amount` : les soldées (`paid`), montant net de ce qui a été rendu ;
     *  - TCK-2774 — `overdue_count` / `overdue_amount` : les non soldées (`status != paid`, `failed` et
     *    `refunded` compris) échues AVANT aujourd'hui à Dakar ; `upcoming_count` / `upcoming_amount` : les
     *    non soldées dues aujourd'hui ou après. Montant = le reste dû, l'accesseur `remaining_amount`
     *    ({@see PaymentHistory::remainingAmountSql()}). Invariant : reçus + en retard + à venir = attendus.
     *    Borné au mois servi : ce n'est pas l'impayé du bailleur (`overdue_*`, toutes périodes). Le jour est
     *    celui d'aujourd'hui quelle que soit la période : sur `last_month`, tout non soldé est en retard.
     *
     * Ni caution, ni restitution de caution (règle de « Ma situation »), ni charges ou régularisation :
     * ce sont des échéances, pas des loyers.
     */
    private function loyersDuMois(QueryBuilder $query, PortfolioScope $scope, PeriodeDuTableauDeBord $periode): void
    {
        // TCK-2791 — le mois servi, au calendrier de Dakar.
        $mois = $periode->debut->setTimezone(self::TIMEZONE);
        $loyers = fn () => LeasePayment::query()
            ->where('lease_payments.payment_type', LeasePaymentType::Rent->value)
            ->where('lease_payments.status', '!=', PaymentStatus::Cancelled->value)
            ->whereBetween('lease_payments.due_date', [$mois->startOfMonth()->toDateString(), $mois->endOfMonth()->toDateString()])
            ->whereIn('lease_payments.lease_id', $scope->leases(Lease::query()->select('leases.id')))
            ->toBase();
        $paye = PaymentStatus::Paid->value;
        // TCK-2774 — « aujourd'hui » au calendrier de Dakar, comme le mois.
        $aujourdhui = CarbonImmutable::now(self::TIMEZONE)->toDateString();
        $resteDu = PaymentHistory::remainingAmountSql('lease_payments');
        $enRetard = 'lease_payments.status != ? AND lease_payments.due_date < ?::date';
        $aVenir = 'lease_payments.status != ? AND lease_payments.due_date >= ?::date';

        $query->selectSub($loyers()->selectRaw('COUNT(*)'), 'rent_expected_count')
            ->selectSub($loyers()->selectRaw('COUNT(*) FILTER (WHERE lease_payments.status = ?)', [$paye]), 'rent_received_count')
            ->selectSub($loyers()->selectRaw('COALESCE(SUM('.CollectedPayments::LEASE_NET_SQL.') FILTER (WHERE lease_payments.status = ?), 0)', [$paye]), 'rent_received_amount')
            ->selectSub($loyers()->selectRaw("COUNT(*) FILTER (WHERE {$enRetard})", [$paye, $aujourdhui]), 'rent_overdue_count')
            ->selectSub($loyers()->selectRaw("COALESCE(SUM({$resteDu}) FILTER (WHERE {$enRetard}), 0)", [$paye, $aujourdhui]), 'rent_overdue_amount')
            ->selectSub($loyers()->selectRaw("COUNT(*) FILTER (WHERE {$aVenir})", [$paye, $aujourdhui]), 'rent_upcoming_count')
            ->selectSub($loyers()->selectRaw("COALESCE(SUM({$resteDu}) FILTER (WHERE {$aVenir}), 0)", [$paye, $aujourdhui]), 'rent_upcoming_amount');
    }

    public function monthlyTimeseries(User $owner, int $months = 12): array
    {
        $months = max(1, min($months, 36));
        $from = now()->subMonthsNoOverflow($months - 1)->startOfMonth();
        $to = now()->endOfMonth();
        $scope = PortfolioScope::landlord((int) $owner->id);

        $leaseIncome = $this->metrics->leaseIncomeByMonth($scope, $from, $to);
        $bookingIncome = $this->metrics->bookingIncomeByMonth($scope, $from, $to);
        $occupancy = $this->metrics->longStayOccupancy($scope, $from, $to);
        $shortStay = $this->metrics->shortStayOccupancy($scope, $from, $to);
        $netPaidOut = $this->metrics->netPaidOutByMonth($scope, $from, $to);

        $labels = array_keys($leaseIncome);

        return [
            'months' => $labels,
            'cashflow' => array_map(
                static fn (string $m): float => round($leaseIncome[$m] + ($bookingIncome[$m] ?? 0.0), 2),
                $labels,
            ),
            'occupancy' => array_map(static fn (string $m): ?float => $occupancy[$m] ?? null, $labels),
            'short_stay_occupancy' => array_map(static fn (string $m): ?float => $shortStay[$m] ?? null, $labels),
            'net_paid_out' => array_map(static fn (string $m): float => $netPaidOut[$m] ?? 0.0, $labels),
        ];
    }
}
