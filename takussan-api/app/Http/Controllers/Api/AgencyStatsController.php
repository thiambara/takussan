<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Lightweight read-only stats for an agency dashboard.
 *
 * Intentionally uses simple aggregate queries — no cache for MVP. Caller
 * authenticates via Sanctum; access is scoped to super_admin, the agency's
 * primary admin, or a member with an admin/agency_admin role inside the
 * agency team.
 *
 * Route: GET /api/agencies/{agency}/stats
 */
class AgencyStatsController extends Controller
{
    public function show(Request $request, Agency $agency): JsonResponse
    {
        $actor = $request->user();

        abort_unless(
            $actor->isSuperAdmin()
                || $agency->primary_admin_id === $actor->id
                || (
                    $request->activeProfile()?->agency_id === $agency->id
                    && $actor->hasRole(['admin', 'agency_admin'])
                ),
            403,
        );

        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();

        $propertiesCount = Property::where('agency_id', $agency->id)->count();
        $membersCount = User::query()->where(function ($q) use ($agency) {
            $q->whereHas('agentProfiles', fn ($qq) => $qq->where('agency_id', $agency->id))->orWhereHas('ownerProfiles', fn ($qq) => $qq->where('agency_id', $agency->id));
        })->count();
        $customersCount = Customer::where('agency_id', $agency->id)->count();

        $activeLeasesCount = Lease::where('agency_id', $agency->id)
            ->where('status', LeaseStatus::Active->value)
            ->count();

        // Sum of commissions on leases actually signed during the current month.
        // Commission is earned at signature — unsigned (draft/pending_signature)
        // leases must not contribute, and a lease signed then terminated in the
        // same window is treated as cancelled.
        $commissionMonth = (float) Lease::where('agency_id', $agency->id)
            ->whereNotNull('signed_at')
            ->whereBetween('signed_at', [$monthStart, $monthEnd])
            ->whereNotIn('status', [
                LeaseStatus::Draft->value,
                LeaseStatus::PendingSignature->value,
                LeaseStatus::Terminated->value,
            ])
            ->sum('commission_amount');

        return $this->json([
            'data' => [
                'agency_id' => $agency->id,
                'period' => [
                    'start' => $monthStart->toIso8601String(),
                    'end' => $monthEnd->toIso8601String(),
                ],
                'properties_count' => $propertiesCount,
                'members_count' => $membersCount,
                'customers_count' => $customersCount,
                'active_leases_count' => $activeLeasesCount,
                'commission_month' => $commissionMonth,
            ],
        ]);
    }
}
