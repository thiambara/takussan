<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Services\Reporting\AgingBalanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-595 (§7, AD17) — `GET /api/agencies/{agency}/finance/aging?group_by=tenant|landlord`.
 *
 * Chiffres consolidés de l'agence : `reports.view_agency` à l'agence (`AgencyPolicy::viewReports`).
 * Ouvert à une agence `individual` : l'hôte suit ses impayés comme une agence, ce n'est pas un
 * reporting cross-équipe.
 */
class AgingBalanceController extends Controller
{
    public function __construct(private readonly AgingBalanceService $service) {}

    public function show(Request $request, Agency $agency): JsonResponse
    {
        $this->authorize('viewReports', $agency);

        $groupBy = $request->query('group_by', AgingBalanceService::GROUP_TENANT);
        abort_code_unless(
            in_array($groupBy, [AgingBalanceService::GROUP_TENANT, AgingBalanceService::GROUP_LANDLORD], true),
            422,
            'reporting.invalid_group_by',
        );

        return $this->json(['data' => $this->service->forAgency($agency, $groupBy)]);
    }
}
