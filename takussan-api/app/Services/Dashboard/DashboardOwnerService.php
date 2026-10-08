<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;

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
    public function __construct(private readonly PortfolioMetrics $metrics) {}

    public function summary(User $owner): array
    {
        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();
        $scope = PortfolioScope::landlord((int) $owner->id);
        $propertyIds = Property::query()->select('id')->where('user_id', $owner->id);

        $portfolio = Property::query()
            ->where('user_id', $owner->id)
            ->toBase()
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS rented', [PropertyStatus::Rented->value])
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS available', [PropertyStatus::Available->value])
            ->first();

        $leases = Lease::query()
            ->where('landlord_id', $owner->id)
            ->where('status', LeaseStatus::Active->value)
            ->toBase()
            ->selectRaw('COUNT(*) AS active, COALESCE(SUM(monthly_rent), 0) AS expected')
            ->first();

        $pendingBookings = Booking::query()
            ->whereIn('property_id', $propertyIds)
            ->where('status', BookingStatus::Pending->value)
            ->count();

        $leaseIncome = $this->metrics->leaseIncomeByMonth($scope, $monthStart, $monthEnd);
        $bookingIncome = $this->metrics->bookingIncomeByMonth($scope, $monthStart, $monthEnd);
        $netPaidOut = $this->metrics->netPaidOutByMonth($scope, $monthStart, $monthEnd);
        $shortStay = $this->metrics->shortStayOccupancy($scope, $monthStart, $monthEnd);
        $overdue = $this->metrics->overdue($scope);
        $month = $monthStart->format('Y-m');

        $leaseIncomeMonth = $leaseIncome[$month] ?? 0.0;
        $bookingIncomeMonth = $bookingIncome[$month] ?? 0.0;

        return [
            'owner_id' => $owner->id,
            'period' => [
                'start' => $monthStart->toIso8601String(),
                'end' => $monthEnd->toIso8601String(),
            ],
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
            ],
            'occupancy' => [
                'rate_percent' => $this->metrics->longStayOccupancyToday($scope),
                'short_stay_percent' => $shortStay[$month] ?? null,
            ],
            'maintenance' => [
                'quotes_pending' => MaintenanceRequest::query()
                    ->whereIn('property_id', $propertyIds)
                    ->where('status', MaintenanceStatus::QuoteSubmitted->value)
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
            'occupancy' => array_map(static fn (string $m): float => $occupancy[$m] ?? 0.0, $labels),
            'short_stay_occupancy' => array_map(static fn (string $m): ?float => $shortStay[$m] ?? null, $labels),
            'net_paid_out' => array_map(static fn (string $m): float => $netPaidOut[$m] ?? 0.0, $labels),
        ];
    }
}
