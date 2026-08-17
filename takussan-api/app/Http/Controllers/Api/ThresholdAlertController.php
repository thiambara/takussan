<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreThresholdAlertRequest;
use App\Http\Requests\Api\UpdateThresholdAlertRequest;
use App\Models\ThresholdAlert;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-032 P3 — CRUD for per-agency alert thresholds.
 */
class ThresholdAlertController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->agency_id || $user->isSuperAdmin(), 403);

        $base = ThresholdAlert::query();
        if (! $user->isSuperAdmin()) {
            $base->where('agency_id', $user->agency_id);
        }

        $paginator = ThresholdAlert::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, $paginator->items());
    }

    public function store(StoreThresholdAlertRequest $request): JsonResponse
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

        $alert = ThresholdAlert::create($validated);

        return $this->json(['data' => $alert], 201);
    }

    public function update(UpdateThresholdAlertRequest $request, ThresholdAlert $thresholdAlert): JsonResponse
    {
        $this->authorizeAgency($request->user(), $thresholdAlert);

        $validated = $request->validated();

        $thresholdAlert->update($validated);

        return $this->json(['data' => $thresholdAlert]);
    }

    public function destroy(Request $request, ThresholdAlert $thresholdAlert): JsonResponse
    {
        $this->authorizeAgency($request->user(), $thresholdAlert);
        $thresholdAlert->delete();

        return $this->json(['message' => 'ok']);
    }

    private function authorizeAgency($user, ThresholdAlert $alert): void
    {
        abort_unless(
            $user->isSuperAdmin()
                || ($user->agency_id !== null && $user->agency_id === $alert->agency_id && $user->isAgencyAdminAt((int) $alert->agency_id)),
            403,
        );
    }
}
