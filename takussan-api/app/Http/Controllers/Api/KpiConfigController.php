<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreKpiConfigRequest;
use App\Http\Requests\Api\UpdateKpiConfigRequest;
use App\Models\KpiConfig;
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
        abort_unless($user->agency_id || $user->isSuperAdmin(), 403);

        $base = KpiConfig::query();
        if (! $user->isSuperAdmin()) {
            $base->where('agency_id', $user->agency_id);
        }

        $paginator = KpiConfig::buildQuery($base, $request)
            ->defaultSort('sort_order')
            ->paginate();

        return $this->paginated($paginator, $paginator->items());
    }

    public function store(StoreKpiConfigRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isSuperAdmin() || ($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id)), 403);

        $validated = $request->validated();

        $agencyId = $validated['agency_id'] ?? $user->agency_id;
        abort_unless($agencyId, 422, 'agency_id is required.');

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
        $this->authorizeAgency($user, $kpiConfig);

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

    private function authorizeAgency($user, KpiConfig $kpi): void
    {
        abort_unless(
            $user->isSuperAdmin()
                || ($user->agency_id !== null && $user->agency_id === $kpi->agency_id && $user->isAgencyAdminAt((int) $kpi->agency_id)),
            403,
        );
    }
}
