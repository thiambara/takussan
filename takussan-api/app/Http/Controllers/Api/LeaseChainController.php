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
        $this->authorize('view', $lease);

        $chain = $this->renewals->chain($lease);

        return $this->json([
            'data' => LeaseResource::collection($chain)->toArray($request),
        ]);
    }
}
