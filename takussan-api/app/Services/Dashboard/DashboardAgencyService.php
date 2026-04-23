<?php

namespace App\Services\Dashboard;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;

/**
 * Aggregates headline KPIs for the agency-level dashboard (TCK-032).
 *
 * The view assumes admin/agency_admin access and returns figures scoped to
 * a single agency. Time-series helpers power the P2 charts.
 */
class DashboardAgencyService
{
    public function summary(Agency $agency): array
    {
        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();

        $propertyIds = Property::where('agency_id', $agency->id)->pluck('id');

        $propertiesCount = $propertyIds->count();
        $publishedCount = Property::where('agency_id', $agency->id)
            ->whereNotNull('published_at')
            ->whereNotIn('status', [PropertyStatus::Draft, PropertyStatus::Archived])
            ->count();
        $rentedCount = Property::where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Rented)
            ->count();
        $availableCount = Property::where('agency_id', $agency->id)
            ->where('status', PropertyStatus::Available)
            ->count();

        $activeLeasesCount = Lease::where('agency_id', $agency->id)
            ->where('status', LeaseStatus::Active)
            ->count();

        $customersCount = Customer::where('agency_id', $agency->id)->count();
        $membersCount = User::where('agency_id', $agency->id)->count();

        $pendingBookings = Booking::whereIn('property_id', $propertyIds)
            ->where('status', BookingStatus::Pending)
            ->count();

        $openMaintenance = MaintenanceRequest::whereIn('property_id', $propertyIds)
            ->whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])
            ->count();

        // Monthly revenue = paid lease payments on agency leases for the period.
        $revenueMonth = (float) LeasePayment::whereHas('lease', fn ($q) => $q->where('agency_id', $agency->id))
            ->where('status', PaymentStatus::Paid)
            ->whereBetween('paid_at', [$monthStart, $monthEnd])
            ->sum('amount');

        $overduePayments = LeasePayment::whereHas('lease', fn ($q) => $q->where('agency_id', $agency->id))
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->whereDate('due_date', '<', now())
            ->count();

        $overdueAmount = (float) LeasePayment::whereHas('lease', fn ($q) => $q->where('agency_id', $agency->id))
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->whereDate('due_date', '<', now())
            ->sum('amount');

        $totalExpectedActive = (float) Lease::where('agency_id', $agency->id)
            ->where('status', LeaseStatus::Active)
            ->sum('monthly_rent');

        $unpaidRate = $totalExpectedActive > 0 ? round(($overdueAmount / $totalExpectedActive) * 100, 2) : 0.0;

        $occupancyRate = $propertiesCount > 0 ? round(($rentedCount / $propertiesCount) * 100, 2) : 0.0;

        $commissionMonth = (float) Lease::where('agency_id', $agency->id)
            ->whereNotNull('signed_at')
            ->whereBetween('signed_at', [$monthStart, $monthEnd])
            ->whereNotIn('status', [LeaseStatus::Draft, LeaseStatus::PendingSignature, LeaseStatus::Terminated])
            ->sum('commission_amount');

        return [
            'agency_id' => $agency->id,
            'period' => [
                'start' => $monthStart->toIso8601String(),
                'end' => $monthEnd->toIso8601String(),
            ],
            'properties' => [
                'total' => $propertiesCount,
                'published' => $publishedCount,
                'rented' => $rentedCount,
                'available' => $availableCount,
            ],
            'leases' => [
                'active' => $activeLeasesCount,
            ],
            'customers_count' => $customersCount,
            'members_count' => $membersCount,
            'bookings' => [
                'pending' => $pendingBookings,
            ],
            'maintenance' => [
                'open' => $openMaintenance,
            ],
            'finance' => [
                'revenue_month' => round($revenueMonth, 2),
                'commission_month' => round($commissionMonth, 2),
                'overdue_count' => $overduePayments,
                'overdue_amount' => round($overdueAmount, 2),
                'unpaid_rate_percent' => $unpaidRate,
            ],
            'occupancy' => [
                'rate_percent' => $occupancyRate,
            ],
        ];
    }

    /**
     * 12-month time-series: monthly revenue and occupancy rate.
     *
     * @return array{months: array<int,string>, revenue: array<int,float>, occupancy: array<int,float>}
     */
    public function monthlyTimeseries(Agency $agency, int $months = 12): array
    {
        $months = max(1, min($months, 36));
        $start = now()->subMonths($months - 1)->startOfMonth();

        $labels = [];
        $revenue = [];
        $occupancy = [];

        for ($i = 0; $i < $months; $i++) {
            $cursor = (clone $start)->addMonths($i);
            $from = $cursor->copy()->startOfMonth();
            $to = $cursor->copy()->endOfMonth();

            $labels[] = $from->format('Y-m');

            $sum = (float) LeasePayment::whereHas('lease', fn ($q) => $q->where('agency_id', $agency->id))
                ->where('status', PaymentStatus::Paid)
                ->whereBetween('paid_at', [$from, $to])
                ->sum('amount');
            $revenue[] = round($sum, 2);

            $total = Property::where('agency_id', $agency->id)
                ->where('created_at', '<=', $to)
                ->count();
            $rented = Lease::where('agency_id', $agency->id)
                ->where('status', LeaseStatus::Active)
                ->where('start_date', '<=', $to)
                ->where(function ($q) use ($from) {
                    $q->whereNull('end_date')->orWhere('end_date', '>=', $from);
                })
                ->count();

            $occupancy[] = $total > 0 ? round(($rented / $total) * 100, 2) : 0.0;
        }

        return [
            'months' => $labels,
            'revenue' => $revenue,
            'occupancy' => $occupancy,
        ];
    }
}
