<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Services\Dashboard\DashboardAgentService;
use App\Services\Dashboard\PeriodeDuTableauDeBord;
use App\Support\Http\ParametreUnique;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/dashboard/agent — CRM pipeline, commissions, pending tasks (TCK-032 P1).
 *
 * TCK-595 (ADR-0049 §4) — `scope=mine` (défaut) : les chiffres de l'agent ; `scope=agency` : ceux de
 * l'agence de son profil actif, sous `AgencyPolicy::viewReports` (403 pour un agent du rôle
 * système). L'accès de base est le personnel de l'agence active (`staffAgencyId()`), plus
 * l'ancien rattachement direct de l'utilisateur à une agence (pont de compatibilité qui ignorait
 * le profil actif).
 *
 * TCK-2791 — `period=last_month` : le mois résumé (`current_month` par défaut, liste fermée, 422 sinon),
 * lu après les gardes.
 */
class DashboardAgentController extends Controller
{
    public function __construct(private readonly DashboardAgentService $service) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $agencyId = $user->staffAgencyId();

        abort_unless($user->isSuperAdmin() || $agencyId !== null, 403);

        $scope = $request->input('scope', DashboardAgentService::SCOPE_MINE);
        abort_code_unless(
            in_array($scope, [DashboardAgentService::SCOPE_MINE, DashboardAgentService::SCOPE_AGENCY], true),
            422,
            'dashboard.invalid_scope',
        );
        if ($scope === DashboardAgentService::SCOPE_AGENCY) {
            $agency = $agencyId !== null ? Agency::query()->find($agencyId) : null;
            abort_if($agency === null, 403);
            $this->authorize('viewReports', $agency);
        }

        $periode = PeriodeDuTableauDeBord::depuisLaRequete($request);

        $data = $this->service->summary($user, $scope, $agencyId, $periode);

        $fieldsParam = $request->input('fields.summary');
        if (is_string($fieldsParam) && $fieldsParam !== '') {
            $keep = array_map('trim', explode(',', $fieldsParam));
            $keep[] = 'agent_id';
            $keep[] = 'agency_id';
            $keep[] = 'period';
            $keep[] = 'scope';
            $data = array_intersect_key($data, array_flip($keep));
        }

        // TCK-1866 — `include[]=…` est ignoré comme une valeur absente (ADR-0075), et non casté.
        $include = ParametreUnique::chaine($request, 'include') ?? '';
        $includes = array_filter(array_map('trim', explode(',', $include)));

        $payload = ['data' => $data];

        if (in_array('timeseries', $includes, true)) {
            $months = (int) $request->input('months', 12);
            $payload['timeseries'] = $this->service->monthlyTimeseries($user, $months, $scope, $agencyId);
        }

        return $this->json($payload);
    }
}
