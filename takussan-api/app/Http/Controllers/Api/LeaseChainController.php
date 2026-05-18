<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\LeaseResource;
use App\Models\Lease;
use App\Services\Lease\LeaseRenewalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-089 — `GET /api/leases/{lease}/chain`. Retourne la chaîne
 * complète (racine → plus récent), utile pour la timeline frontend
 * et les rapports d'historique.
 */
class LeaseChainController extends Controller
{
    public function __construct(protected LeaseRenewalService $renewals) {}

    public function index(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeAccess($request, $lease);

        $chain = $this->renewals->chain($lease);

        return $this->json([
            'data' => LeaseResource::collection($chain)->toArray($request),
        ]);
    }

    /**
     * Same scope check as `LeaseController` — landlord, agency member,
     * tenant via linked user, or admin.
     */
    protected function authorizeAccess(Request $request, Lease $lease): void
    {
        $user = $request->user();
        $ok = $user?->isSuperAdmin()
            || $lease->landlord_id === $user?->id
            || ($user?->agency_id && $user->agency_id === $lease->agency_id)
            || ($lease->tenant && $lease->tenant->user_id === $user?->id);

        abort_unless($ok, 403);
    }
}
