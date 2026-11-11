<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Services\Reporting\FinanceSummaryService;
use App\Support\Http\ParametreUnique;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2657 (ADR-0100 § 4) — `GET /api/agencies/{agency}/finance/summary?period=YYYY-MM` : le point
 * de l'argent d'un mois (défaut : le mois courant, heure de Dakar).
 *
 * Même autorisation que la balance âgée (`AgingBalanceController`) : `reports.view_agency` à
 * l'agence, sous son profil actif (`AgencyPolicy::viewReports`). L'autorisation précède la lecture
 * du paramètre : un agent reçoit 403, même avec une période illisible.
 */
class FinanceSummaryController extends Controller
{
    public function __construct(private readonly FinanceSummaryService $service) {}

    public function show(Request $request, Agency $agency): JsonResponse
    {
        $this->authorize('viewReports', $agency);

        // ADR-0075 — une période en liste vaut une période absente.
        $period = ParametreUnique::chaine($request, 'period') ?? FinanceSummaryService::currentPeriod();
        abort_code_unless(preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period) === 1, 422, 'reporting.invalid_period');

        return $this->json(['data' => $this->service->forAgency($agency, $period)]);
    }
}
