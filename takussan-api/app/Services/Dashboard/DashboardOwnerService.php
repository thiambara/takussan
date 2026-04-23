<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;

/**
 * Owner-facing dashboard — portfolio KPIs scoped to the landlord's user id.
 */
class DashboardOwnerService
{
    public function summary(User $owner): array
    {
        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();

        $propertyIds = Property::where('user_id', $owner->id)->pluck('id');

        $totalProperties = $propertyIds->count();
        $rented = Property::where('user_id', $owner->id)->where('status', PropertyStatus::Rented)->count();
        $available = Property::where('user_id', $owner->id)->where('status', PropertyStatus::Available)->count();

        $activeLeases = Lease::where('landlord_id', $owner->id)
            ->where('status', LeaseStatus::Active)
            ->count();

        $pendingBookings = Booking::whereIn('property_id', $propertyIds)
            ->where('status', BookingStatus::Pending)
            ->count();

        // Cashflow = sum of paid lease payments on owner leases for the period.
        $cashflowMonth = (float) LeasePayment::whereHas('lease', fn ($q) => $q->where('landlord_id', $owner->id))
            ->where('status', PaymentStatus::Paid)
            ->whereBetween('paid_at', [$monthStart, $monthEnd])
            ->sum('amount');

        $overdueCount = LeasePayment::whereHas('lease', fn ($q) => $q->where('landlord_id', $owner->id))
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->whereDate('due_date', '<', now())
            ->count();

        $overdueAmount = (float) LeasePayment::whereHas('lease', fn ($q) => $q->where('landlord_id', $owner->id))
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->whereDate('due_date', '<', now())
            ->sum('amount');

        $occupancyRate = $totalProperties > 0
            ? round(($rented / $totalProperties) * 100, 2)
            : 0.0;

        $expectedMonthly = (float) Lease::where('landlord_id', $owner->id)
            ->where('status', LeaseStatus::Active)
            ->sum('monthly_rent');

        return [
            'owner_id' => $owner->id,
            'period' => [
                'start' => $monthStart->toIso8601String(),
                'end' => $monthEnd->toIso8601String(),
            ],
            'portfolio' => [
                'total' => $totalProperties,
                'rented' => $rented,
                'available' => $available,
            ],
            'leases' => [
                'active' => $activeLeases,
            ],
            'bookings' => [
                'pending' => $pendingBookings,
            ],
            'finance' => [
                'cashflow_month' => round($cashflowMonth, 2),
                'expected_monthly' => round($expectedMonthly, 2),
                'overdue_count' => $overdueCount,
                'overdue_amount' => round($overdueAmount, 2),
            ],
            'occupancy' => [
                'rate_percent' => $occupancyRate,
            ],
        ];
    }

    public function monthlyTimeseries(User $owner, int $months = 12): array
    {
        $months = max(1, min($months, 36));
        $start = now()->subMonths($months - 1)->startOfMonth();

        $labels = [];
        $cashflow = [];
        $occupancy = [];

        $totalProperties = Property::where('user_id', $owner->id)->count();

        for ($i = 0; $i < $months; $i++) {
            $cursor = (clone $start)->addMonths($i);
            $from = $cursor->copy()->startOfMonth();
            $to = $cursor->copy()->endOfMonth();

            $labels[] = $from->format('Y-m');

            $sum = (float) LeasePayment::whereHas('lease', fn ($q) => $q->where('landlord_id', $owner->id))
                ->where('status', PaymentStatus::Paid)
                ->whereBetween('paid_at', [$from, $to])
                ->sum('amount');
            $cashflow[] = round($sum, 2);

            $rented = Lease::where('landlord_id', $owner->id)
                ->where('status', LeaseStatus::Active)
                ->where('start_date', '<=', $to)
                ->where(function ($q) use ($from) {
                    $q->whereNull('end_date')->orWhere('end_date', '>=', $from);
                })
                ->count();

            $occupancy[] = $totalProperties > 0 ? round(($rented / $totalProperties) * 100, 2) : 0.0;
        }

        return [
            'months' => $labels,
            'cashflow' => $cashflow,
            'occupancy' => $occupancy,
        ];
    }
}
