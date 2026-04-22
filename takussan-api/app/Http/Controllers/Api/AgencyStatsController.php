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
            $actor->hasRole('super_admin')
                || $agency->primary_admin_id === $actor->id
                || ($actor->agency_id === $agency->id && $actor->hasRole(['admin', 'agency_admin'])),
            403,
        );

        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();

        $propertiesCount = Property::where('agency_id', $agency->id)->count();
        $membersCount = User::where('agency_id', $agency->id)->count();
        $customersCount = Customer::where('agency_id', $agency->id)->count();

        $activeLeasesCount = Lease::where('agency_id', $agency->id)
            ->where('status', LeaseStatus::Active->value)
            ->count();

        // Sum of commissions on leases signed during the current month.
        // Uses `signed_at` when available, otherwise `created_at` (leases are
        // routinely created before signature).
        $commissionMonth = (float) Lease::where('agency_id', $agency->id)
            ->where(function ($q) use ($monthStart, $monthEnd): void {
                $q->whereBetween('signed_at', [$monthStart, $monthEnd])
                    ->orWhere(function ($qq) use ($monthStart, $monthEnd): void {
                        $qq->whereNull('signed_at')
                            ->whereBetween('created_at', [$monthStart, $monthEnd]);
                    });
            })
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
