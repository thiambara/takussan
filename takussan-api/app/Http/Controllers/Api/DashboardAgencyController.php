<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Services\Dashboard\DashboardAgencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/dashboard/agency
 *
 * Returns headline KPIs for the authenticated admin's agency:
 * properties, active leases, monthly revenue, occupancy rate and unpaid ratio.
 *
 * - `?agency_id=…` — optional, super_admin only; defaults to the user's agency.
 * - `?include=timeseries` — appends a 12-month revenue/occupancy chart.
 * - `?months=6` — overrides the chart window (1..36).
 * - `?fields[summary]=properties,finance` — sparse sections (spatie-style).
 */
class DashboardAgencyController extends Controller
{
    public function __construct(private readonly DashboardAgencyService $service) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        $activeAgencyId = $request->activeProfile()?->agency_id ?? $user->agency_id;
        $agencyId = $request->integer('agency_id') ?: $activeAgencyId;
        abort_unless($agencyId, 403, 'No agency context.');

        $agency = Agency::findOrFail($agencyId);

        abort_unless(
            $user->isSuperAdmin()
                || $agency->primary_admin_id === $user->id
                || (
                    $request->activeProfile()?->agency_id === $agency->id
                    && $user->hasRole(['admin', 'agency_admin', 'agent'])
                ),
            403,
        );

        // Reporting cross-équipe réservé aux agences `standard` (cf.
        // features.md §2.2). Les autres dashboards (agent/owner/tenant)
        // restent ouverts car ils ne sont pas cross-team.
        abort_unless(
            $agency->kind === AgencyKind::Standard,
            403,
            'Agency dashboard is reserved for standard agencies.',
        );

        $data = $this->service->summary($agency);

        // Sparse sections via ?fields[summary]=properties,finance,…
        $fieldsParam = $request->input('fields.summary');
        if (is_string($fieldsParam) && $fieldsParam !== '') {
            $keep = array_map('trim', explode(',', $fieldsParam));
            $keep[] = 'agency_id';
            $keep[] = 'period';
            $data = array_intersect_key($data, array_flip($keep));
        }

        $includes = array_filter(array_map('trim', explode(',', (string) $request->input('include', ''))));

        $payload = ['data' => $data];

        if (in_array('timeseries', $includes, true)) {
            $months = (int) $request->input('months', 12);
            $payload['timeseries'] = $this->service->monthlyTimeseries($agency, $months);
        }

        return $this->json($payload);
    }
}
