<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Agency\SubmitAgencyUpgradeRequestRequest;
use App\Http\Resources\AgencyUpgradeRequestResource;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Services\Agency\AgencyUpgradeRequestService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-267 — agency-side surface for the `individual → standard`
 * upgrade flow.
 *
 *  - `GET    /api/agencies/{agency}/upgrade-requests`            → index
 *  - `POST   /api/agencies/{agency}/upgrade-requests`            → submit
 *  - `DELETE /api/agencies/{agency}/upgrade-requests/{request}`  → revoke
 *
 * All business rules live in {@see AgencyUpgradeRequestService}; this
 * class only authorises and dispatches.
 */
class AgencyUpgradeRequestController extends Controller
{
    public function __construct(private readonly AgencyUpgradeRequestService $service) {}

    /**
     * GET /api/agencies/{agency}/upgrade-requests
     *
     * Lists every upgrade request for `$agency`, scoped to that agency
     * to prevent cross-tenant leakage. Pagination is offered for
     * symmetry with the rest of the API; in practice the listing stays
     * very short (1 pending + a handful of historical records).
     */
    public function index(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('viewAny', [AgencyUpgradeRequest::class, $agency])) {
            throw new AuthorizationException(__('agency_upgrade.submit.errors.permission_denied'));
        }

        $base = AgencyUpgradeRequest::query()->where('agency_id', $agency->id);

        $paginator = AgencyUpgradeRequest::buildQuery($base, $request)
            ->defaultSort('-submitted_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->paginated($paginator, AgencyUpgradeRequestResource::collection($paginator)->toArray($request));
    }

    /**
     * POST /api/agencies/{agency}/upgrade-requests
     */
    public function store(SubmitAgencyUpgradeRequestRequest $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('create', [AgencyUpgradeRequest::class, $agency])) {
            throw new AuthorizationException(__('agency_upgrade.submit.errors.permission_denied'));
        }

        $upgradeRequest = $this->service->submit(
            $agency,
            $user,
            $request->safe()->except('statuts_doc'),
            $request->file('statuts_doc'),
        );

        return $this->json(
            ['data' => AgencyUpgradeRequestResource::make($upgradeRequest)->toArray($request)],
            201,
        );
    }

    /**
     * DELETE /api/agencies/{agency}/upgrade-requests/{request}
     */
    public function destroy(Request $request, Agency $agency, AgencyUpgradeRequest $upgradeRequest): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        // Defensive scoping: the route binds {agency} and {upgradeRequest}
        // independently, so we re-check the FK to avoid revoking another
        // agency's request via path traversal.
        abort_if((int) $upgradeRequest->agency_id !== (int) $agency->id, 404);

        if (! $user->can('revoke', $upgradeRequest)) {
            throw new AuthorizationException(__('agency_upgrade.revoke.errors.permission_denied'));
        }

        $revoked = $this->service->revoke($upgradeRequest, $user);

        return $this->json(
            ['data' => AgencyUpgradeRequestResource::make($revoked)->toArray($request)],
            200,
        );
    }
}
