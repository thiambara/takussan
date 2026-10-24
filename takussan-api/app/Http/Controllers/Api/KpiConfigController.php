<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreKpiConfigRequest;
use App\Http\Requests\Api\UpdateKpiConfigRequest;
use App\Http\Resources\KpiConfigResource;
use App\Models\KpiConfig;
use App\Policies\AgencyIndicatorPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-032 P3 — CRUD for per-agency KPI customisation.
 *
 * Standard spatie-query-builder conventions are preserved via the HasQueryBuilder
 * trait on the model; consumers may pass `fields[kpi_configs]=…`,
 * `filter[…]=…`, `include=agency`, and `sort=…`.
 */
class KpiConfigController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // TCK-587 — configuration de l'agence : son PERSONNEL (ADR-0031), plus tout membre.
        $staffAgencyId = $user->staffAgencyId();
        abort_code_unless($staffAgencyId !== null || $user->isSuperAdmin(), 403, 'agency.staff_only');

        $base = KpiConfig::query();
        if (! $user->isSuperAdmin()) {
            $base->where('agency_id', $staffAgencyId);
        }

        $paginator = KpiConfig::buildQuery($base, $request)
            ->defaultSort('sort_order')
            ->paginate();

        // TCK-2045 (P61.04) — par la ressource, et non plus le modèle brut.
        return $this->paginated($paginator, KpiConfigResource::collection($paginator)->toArray($request));
    }

    public function store(StoreKpiConfigRequest $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validated();

        $agencyId = $validated['agency_id'] ?? $user->agency_id;
        abort_code_unless($agencyId, 422, 'agency.id_required');

        if (! $user->isSuperAdmin()) {
            abort_unless((int) $agencyId === (int) $user->agency_id, 403);
        }

        $validated['agency_id'] = $agencyId;

        $kpi = KpiConfig::create($validated);

        return $this->json(['data' => $kpi], 201);
    }

    public function update(UpdateKpiConfigRequest $request, KpiConfig $kpiConfig): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validated();

        $kpiConfig->update($validated);

        return $this->json(['data' => $kpiConfig]);
    }

    public function destroy(Request $request, KpiConfig $kpiConfig): JsonResponse
    {
        $this->authorizeAgency($request->user(), $kpiConfig);
        $kpiConfig->delete();

        return $this->json(['message' => 'ok']);
    }

    /**
     * @return array<int,string>
     */
    public function metrics(): JsonResponse
    {
        return $this->json(['data' => KpiConfig::allowedMetrics()]);
    }

    /**
     * TCK-1701 (P82.04) — un RELAIS : la règle vit dans {@see AgencyIndicatorPolicy::delete()}
     * (`agency.update` sous le profil actif). Le helper reste parce qu'il est inscrit aux
     * exemptions de `scripts/check-controller-authorization.mjs`, qui refuse une exemption morte.
     */
    private function authorizeAgency($user, KpiConfig $kpi): void
    {
        abort_unless($user->can('delete', $kpi), 403);
    }
}
