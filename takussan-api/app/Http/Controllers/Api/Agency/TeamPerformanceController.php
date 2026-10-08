<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ShowTeamPerformanceRequest;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Services\Reporting\TeamPerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/**
 * TCK-595 (§6, AD16) — `GET /api/agencies/{agency}/team-performance?period=Y-m`.
 *
 * Reporting cross-équipe : `reports.view_agency` à l'agence (`AgencyPolicy::viewReports`), et une
 * agence `standard` seulement (`features.md` §1.12, comme `GET /api/dashboard/agency`).
 */
class TeamPerformanceController extends Controller
{
    public function __construct(private readonly TeamPerformanceService $service) {}

    public function show(ShowTeamPerformanceRequest $request, Agency $agency): JsonResponse
    {
        $this->authorize('viewReports', $agency);
        abort_code_unless($agency->kind === AgencyKind::Standard, 403, 'agency.standard_only');

        $period = $request->validated('period');
        $month = is_string($period) ? Carbon::createFromFormat('!Y-m', $period) : now();

        return $this->json(['data' => $this->service->forPeriod($agency, $month)]);
    }
}
