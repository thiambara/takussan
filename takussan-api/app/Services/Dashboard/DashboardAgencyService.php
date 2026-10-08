<?php

namespace App\Services\Dashboard;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Aggregates headline KPIs for the agency-level dashboard (TCK-032).
 *
 * TCK-595 — occupation, encaissé, impayés et cautions sortent de {@see PortfolioMetrics}, le calcul
 * du bailleur, appliqué au périmètre de l'agence : un même jeu de données rend les mêmes chiffres
 * dans les deux tableaux de bord (AC5). Le nombre de requêtes ne dépend ni du nombre de mois, ni du
 * nombre de biens (AC6).
 */
class DashboardAgencyService
{
    public function __construct(private readonly PortfolioMetrics $metrics) {}

    public function summary(Agency $agency): array
    {
        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();
        $month = $monthStart->format('Y-m');
        $scope = PortfolioScope::agency((int) $agency->id);
        $propertyIds = Property::query()->select('id')->where('agency_id', $agency->id);

        $properties = Property::query()
            ->where('agency_id', $agency->id)
            ->toBase()
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw(
                'COUNT(*) FILTER (WHERE published_at IS NOT NULL AND status NOT IN (?, ?)) AS published',
                [PropertyStatus::Draft->value, PropertyStatus::Archived->value],
            )
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS rented', [PropertyStatus::Rented->value])
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS available', [PropertyStatus::Available->value])
            ->first();

        $leases = Lease::query()
            ->where('agency_id', $agency->id)
            ->where('status', LeaseStatus::Active->value)
            ->toBase()
            ->selectRaw('COUNT(*) AS active, COALESCE(SUM(monthly_rent), 0) AS expected')
            ->first();

        $customersCount = Customer::where('agency_id', $agency->id)->count();

        $pendingBookings = Booking::query()
            ->whereIn('property_id', $propertyIds)
            ->where('status', BookingStatus::Pending->value)
            ->count();

        $openMaintenance = MaintenanceRequest::query()
            ->whereIn('property_id', $propertyIds)
            ->whereIn('status', [MaintenanceStatus::Open->value, MaintenanceStatus::InProgress->value])
            ->count();

        $leaseIncome = $this->metrics->leaseIncomeByMonth($scope, $monthStart, $monthEnd);
        $bookingIncome = $this->metrics->bookingIncomeByMonth($scope, $monthStart, $monthEnd);
        $netPaidOut = $this->metrics->netPaidOutByMonth($scope, $monthStart, $monthEnd);
        $shortStay = $this->metrics->shortStayOccupancy($scope, $monthStart, $monthEnd);
        $overdue = $this->metrics->overdue($scope);

        $leaseIncomeMonth = $leaseIncome[$month] ?? 0.0;
        $bookingIncomeMonth = $bookingIncome[$month] ?? 0.0;
        $expected = (float) $leases->expected;

        return [
            'agency_id' => $agency->id,
            'period' => [
                'start' => $monthStart->toIso8601String(),
                'end' => $monthEnd->toIso8601String(),
            ],
            'properties' => [
                'total' => (int) $properties->total,
                'published' => (int) $properties->published,
                'rented' => (int) $properties->rented,
                'available' => (int) $properties->available,
            ],
            'leases' => [
                'active' => (int) $leases->active,
            ],
            'customers_count' => $customersCount,
            'members_count' => self::membersCount((int) $agency->id),
            'bookings' => [
                'pending' => $pendingBookings,
            ],
            'maintenance' => [
                'open' => $openMaintenance,
            ],
            'finance' => [
                'revenue_month' => round($leaseIncomeMonth + $bookingIncomeMonth, 2),
                'lease_income_month' => $leaseIncomeMonth,
                'booking_income_month' => $bookingIncomeMonth,
                'net_paid_out_month' => $netPaidOut[$month] ?? 0.0,
                'deposits_held' => $this->metrics->depositsHeld($scope),
                'commission_month' => self::commissionMonth((int) $agency->id),
                'overdue_count' => $overdue['count'],
                'overdue_amount' => $overdue['amount'],
                'unpaid_rate_percent' => $expected > 0 ? round(($overdue['amount'] / $expected) * 100, 2) : 0.0,
            ],
            'occupancy' => [
                'rate_percent' => $this->metrics->longStayOccupancyToday($scope),
                'short_stay_percent' => $shortStay[$month] ?? null,
            ],
        ];
    }

    /**
     * Monthly time-series: revenue (encaissé) and long-stay occupancy, one grouped query each.
     *
     * @return array{months: array<int,string>, revenue: array<int,float>, occupancy: array<int,float>, short_stay_occupancy: array<int,float|null>}
     */
    public function monthlyTimeseries(Agency $agency, int $months = 12): array
    {
        $months = max(1, min($months, 36));
        $from = now()->subMonthsNoOverflow($months - 1)->startOfMonth();
        $to = now()->endOfMonth();
        $scope = PortfolioScope::agency((int) $agency->id);

        $leaseIncome = $this->metrics->leaseIncomeByMonth($scope, $from, $to);
        $bookingIncome = $this->metrics->bookingIncomeByMonth($scope, $from, $to);
        $occupancy = $this->metrics->longStayOccupancy($scope, $from, $to);
        $shortStay = $this->metrics->shortStayOccupancy($scope, $from, $to);

        $labels = array_keys($leaseIncome);

        return [
            'months' => $labels,
            'revenue' => array_map(static fn (string $m): float => round($leaseIncome[$m] + ($bookingIncome[$m] ?? 0.0), 2), $labels),
            'occupancy' => array_map(static fn (string $m): float => $occupancy[$m] ?? 0.0, $labels),
            'short_stay_occupancy' => array_map(static fn (string $m): ?float => $shortStay[$m] ?? null, $labels),
        ];
    }

    /**
     * TCK-595 (5 bis) — l'ÉQUIPE : utilisateurs distincts portant un profil agent ou admin d'agence
     * ACTIF dans l'agence. L'ancien compte additionnait agents et bailleurs, de tout statut, et omettait
     * les admins, sous une tuile « Équipe » qui mène à `/admin/team`.
     */
    public static function membersCount(int $agencyId): int
    {
        $staff = AgentProfile::query()->active()->where('agency_id', $agencyId)->select('user_id')
            ->union(AgencyAdminProfile::query()->active()->where('agency_id', $agencyId)->select('user_id'));

        return DB::query()->fromSub($staff, 'staff')->count();
    }

    /**
     * TCK-595 (ADR-0049 §5) — Σ `leases.commission_amount` des baux ACTIVÉS dans le mois courant
     * (`signed_at` dans le mois, hors `draft` et `pending_signature`). Un bail résilié depuis reste
     * compté : sa commission était acquise, et ses lignes du grand livre restent `due`.
     */
    public static function commissionMonth(int $agencyId): float
    {
        return self::commissionBetween($agencyId, now()->startOfMonth(), now()->endOfMonth());
    }

    /** La même règle sur une période quelconque (vue agent `scope=agency`, cumul annuel). */
    public static function commissionBetween(int $agencyId, CarbonInterface $from, CarbonInterface $to): float
    {
        return round((float) Lease::query()
            ->where('agency_id', $agencyId)
            ->whereBetween('signed_at', [$from, $to])
            ->whereNotIn('status', [LeaseStatus::Draft->value, LeaseStatus::PendingSignature->value])
            ->sum('commission_amount'), 2);
    }
}
