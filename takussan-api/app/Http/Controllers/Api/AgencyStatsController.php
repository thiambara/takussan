<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Dashboard\DashboardAgencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Lightweight read-only stats for an agency dashboard.
 *
 * Intentionally uses simple aggregate queries — no cache for MVP. Access:
 * `reports.view_agency` at the agency (`AgencyPolicy::viewReports`, TCK-595),
 * or super_admin.
 *
 * Route: GET /api/agencies/{agency}/stats
 */
class AgencyStatsController extends Controller
{
    public function show(Request $request, Agency $agency): JsonResponse
    {
        // TCK-595 (ADR-0049 §4) — la même garde que `GET /api/dashboard/agency`.
        $this->authorize('viewReports', $agency);

        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();

        $propertiesCount = Property::where('agency_id', $agency->id)->count();
        $membersCount = DashboardAgencyService::membersCount((int) $agency->id);
        $customersCount = Customer::where('agency_id', $agency->id)->count();

        $activeLeasesCount = Lease::where('agency_id', $agency->id)
            ->where('status', LeaseStatus::Active->value)
            ->count();

        // TCK-595 (ADR-0049 §5) — la même règle que la tuile du tableau de bord d'agence.
        $commissionMonth = DashboardAgencyService::commissionMonth((int) $agency->id);

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
