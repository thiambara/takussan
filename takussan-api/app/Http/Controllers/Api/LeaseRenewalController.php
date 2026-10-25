<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\RenewLeaseRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Lease;
use App\Services\Lease\LeaseRenewalService;
use App\Services\Model\LeaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-089 — `POST /api/leases/{lease}/renew`. Crée un avenant
 * (Lease enfant chaîné via `renewed_from_lease_id`). Replace l'ancien
 * `LeaseController@renew` (TCK-027) qui ne validait pas les invariants
 * (no-active-child, max-chain, tenant/property-immutables, ActivityLog,
 * event/notification).
 */
class LeaseRenewalController extends Controller
{
    public function __construct(
        protected LeaseRenewalService $renewals,
        protected LeaseService $leases,
    ) {}

    public function store(RenewLeaseRequest $request, Lease $lease): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null && Gate::forUser($user)->allows('renew', $lease), 403);
        // TCK-2286 (P227.01, ADR-0049 §1) — le taux de gestion du bail enfant : le personnel de
        // l'agence du bail sous `leases.create`, jamais le bailleur (403). Absent, il suit le parent.
        $this->leases->assertMaySetCommissionTerms($user, $lease->agency_id !== null ? (int) $lease->agency_id : null, $request->validated());

        $child = $this->renewals->renew($lease, $request->validated(), $user);

        return $this->json([
            'data' => LeaseResource::make($child->load(['property', 'tenant', 'renewedFrom']))->resolve($request),
            // P231.01 (TCK-2316) — l'enfant naît sans garant : l'écran dit combien n'ont pas suivi.
            'meta' => ['guarantors_not_carried_over' => $this->renewals->guarantorsNotCarriedOver($lease)],
        ], 201);
    }
}
