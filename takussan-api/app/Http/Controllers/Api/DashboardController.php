<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Dashboard\DashboardRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private readonly DashboardRoleResolver $resolver) {}

    /**
     * GET /api/dashboard/me — adaptive entry returning role + flat metrics + sections.
     * TCK-595 — every account resolves (an account without any other role is a client).
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        // TCK-595 — le résolveur rend toujours une vue : au pire celle du client.
        $metrics = $this->resolver->resolve($user);

        return $this->json([
            'data' => [
                'role' => $metrics->role(),
                'metrics' => $metrics->metrics($user),
                'sections' => $metrics->sections($user),
            ],
        ]);
    }

    /**
     * TCK-595 (H-2 de la vérification de TCK-594) — une restitution de caution en attente est due AU
     * locataire : elle n'est jamais un impayé (`exceptDepositRefunds()`).
     */
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->isSuperAdmin()) {
            return $this->json(['data' => $this->globalStats()]);
        }

        $activeAgencyId = $request->activeProfile()?->agency_id ?? $user->agency_id;
        if ($activeAgencyId && $user->isAgencyAdminAt((int) $activeAgencyId)) {
            return $this->json(['data' => $this->agencyStats($activeAgencyId)]);
        }

        if ($activeAgencyId && $user->isAgentAt((int) $activeAgencyId)) {
            return $this->json(['data' => $this->agentStats($user->id, $activeAgencyId)]);
        }

        if ($activeAgencyId && $user->isOwnerAt((int) $activeAgencyId)) {
            return $this->json(['data' => $this->ownerStats($user->id)]);
        }

        // TCK-278 — `tenant` reste dérivé (cf. Règle 5) : présence en
        // Customer suffit.
        if (Customer::where('user_id', $user->id)->exists()) {
            return $this->json(['data' => $this->tenantStats($user->id)]);
        }

        // Default: owner-level stats (covers users with no explicit role who own properties)
        return $this->json(['data' => $this->ownerStats($user->id)]);
    }

    private function globalStats(): array
    {
        return [
            'properties_count' => Property::count(),
            'active_leases' => Lease::where('status', LeaseStatus::Active)->count(),
            'pending_bookings' => Booking::where('status', BookingStatus::Pending)->count(),
            'open_maintenance' => MaintenanceRequest::whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])->count(),
            'overdue_payments' => CollectedPayments::leaseOwed()->whereDate('due_date', '<', now())->count(),
        ];
    }

    private function agencyStats(int $agencyId): array
    {
        $propertyScope = fn ($q) => $q->where('agency_id', $agencyId);
        $leaseScope = fn ($q) => $q->where('agency_id', $agencyId);

        return [
            'properties_count' => Property::tap($propertyScope)->count(),
            'active_leases' => Lease::tap($leaseScope)->where('status', LeaseStatus::Active)->count(),
            'pending_bookings' => Booking::whereHas('property', $propertyScope)->where('status', BookingStatus::Pending)->count(),
            'open_maintenance' => MaintenanceRequest::whereHas('property', $propertyScope)->whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])->count(),
            'overdue_payments' => CollectedPayments::leaseOwed(LeasePayment::whereHas('lease', $leaseScope))->whereDate('due_date', '<', now())->count(),
            'customers_count' => Customer::where('agency_id', $agencyId)->count(),
        ];
    }

    private function agentStats(int $userId, int $agencyId): array
    {
        $propertyScope = fn ($q) => $q->where('user_id', $userId)->orWhere('agency_id', $agencyId);

        return [
            'properties_count' => Property::where('user_id', $userId)->count(),
            'active_leases' => Lease::where('agency_id', $agencyId)->where('status', LeaseStatus::Active)->count(),
            'pending_bookings' => Booking::whereHas('property', fn ($q) => $q->where('user_id', $userId))->where('status', BookingStatus::Pending)->count(),
            'open_maintenance' => MaintenanceRequest::whereHas('property', fn ($q) => $q->where('user_id', $userId))->whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])->count(),
        ];
    }

    private function ownerStats(int $userId): array
    {
        $propertyScope = fn ($q) => $q->where('user_id', $userId);
        $leaseScope = fn ($q) => $q->where('landlord_id', $userId);

        return [
            'properties_count' => Property::tap($propertyScope)->count(),
            'active_leases' => Lease::tap($leaseScope)->where('status', LeaseStatus::Active)->count(),
            'pending_bookings' => Booking::whereHas('property', $propertyScope)->where('status', BookingStatus::Pending)->count(),
            'overdue_payments' => CollectedPayments::leaseOwed(LeasePayment::whereHas('lease', $leaseScope))->whereDate('due_date', '<', now())->count(),
        ];
    }

    private function tenantStats(int $userId): array
    {
        $customer = Customer::where('user_id', $userId)->first();

        return [
            'active_lease' => $customer ? Lease::where('tenant_id', $customer->id)->where('status', LeaseStatus::Active)->count() : 0,
            'pending_bookings' => $customer ? Booking::where('customer_id', $customer->id)->where('status', BookingStatus::Pending)->count() : 0,
            'overdue_payments' => $customer ? CollectedPayments::leaseOwed(LeasePayment::where('payer_id', $customer->id))->whereDate('due_date', '<', now())->count() : 0,
            'open_maintenance' => $customer ? MaintenanceRequest::where('requester_id', $userId)->whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])->count() : 0,
        ];
    }
}
