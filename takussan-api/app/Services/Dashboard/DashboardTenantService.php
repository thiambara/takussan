<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\User;

/**
 * Tenant-facing dashboard — upcoming payments, active lease, documents.
 */
class DashboardTenantService
{
    public function summary(User $user): array
    {
        $customer = Customer::where('user_id', $user->id)->first();

        if ($customer === null) {
            return [
                'tenant_id' => $user->id,
                'customer_id' => null,
                'has_customer_profile' => false,
                'leases' => ['active' => 0],
                'bookings' => ['pending' => 0],
                'payments' => [
                    'next_due' => null,
                    'upcoming_30d' => [],
                    'overdue_count' => 0,
                    'overdue_amount' => 0.0,
                ],
                'maintenance' => ['open' => 0],
                'documents' => ['recent' => []],
            ];
        }

        $activeLeases = Lease::where('tenant_id', $customer->id)
            ->where('status', LeaseStatus::Active)
            ->count();

        $pendingBookings = Booking::where('customer_id', $customer->id)
            ->where('status', BookingStatus::Pending)
            ->count();

        $nextDue = LeasePayment::where('payer_id', $customer->id)
            ->where('status', PaymentStatus::Pending)
            ->whereNotNull('due_date')
            ->orderBy('due_date')
            ->first(['id', 'lease_id', 'amount', 'currency', 'due_date', 'status']);

        $upcoming = LeasePayment::where('payer_id', $customer->id)
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->whereBetween('due_date', [now()->toDateString(), now()->addDays(30)->toDateString()])
            ->orderBy('due_date')
            ->get(['id', 'lease_id', 'amount', 'currency', 'due_date', 'status'])
            ->map(fn ($p) => [
                'id' => $p->id,
                'lease_id' => $p->lease_id,
                'amount' => (float) $p->amount,
                'currency' => $p->currency?->value,
                'due_date' => $p->due_date?->toDateString(),
                'status' => $p->status?->value,
            ])->all();

        $overdueCount = LeasePayment::where('payer_id', $customer->id)
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->whereDate('due_date', '<', now())
            ->count();

        $overdueAmount = (float) LeasePayment::where('payer_id', $customer->id)
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->whereDate('due_date', '<', now())
            ->sum('amount');

        $openMaintenance = MaintenanceRequest::where('requester_id', $user->id)
            ->whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])
            ->count();

        $recentDocs = Document::where(function ($q) use ($user, $customer) {
            $q->where(function ($qq) use ($customer) {
                $qq->where('documentable_type', Customer::class)->where('documentable_id', $customer->id);
            })->orWhere('uploaded_by', $user->id);
        })
            ->latest('created_at')
            ->limit(5)
            ->get(['id', 'name', 'type', 'created_at'])
            ->map(fn ($d) => [
                'id' => $d->id,
                'name' => $d->name,
                'type' => $d->type?->value,
                'created_at' => $d->created_at?->toIso8601String(),
            ])->all();

        return [
            'tenant_id' => $user->id,
            'customer_id' => $customer->id,
            'has_customer_profile' => true,
            'leases' => ['active' => $activeLeases],
            'bookings' => ['pending' => $pendingBookings],
            'payments' => [
                'next_due' => $nextDue ? [
                    'id' => $nextDue->id,
                    'lease_id' => $nextDue->lease_id,
                    'amount' => (float) $nextDue->amount,
                    'currency' => $nextDue->currency?->value,
                    'due_date' => $nextDue->due_date?->toDateString(),
                    'status' => $nextDue->status?->value,
                ] : null,
                'upcoming_30d' => $upcoming,
                'overdue_count' => $overdueCount,
                'overdue_amount' => round($overdueAmount, 2),
            ],
            'maintenance' => ['open' => $openMaintenance],
            'documents' => ['recent' => $recentDocs],
        ];
    }
}
