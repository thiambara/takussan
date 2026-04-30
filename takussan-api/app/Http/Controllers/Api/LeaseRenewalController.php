<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\RenewLeaseRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Lease;
use App\Services\Lease\LeaseRenewalService;
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
    public function __construct(protected LeaseRenewalService $renewals) {}

    public function store(RenewLeaseRequest $request, Lease $lease): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null && Gate::forUser($user)->allows('renew', $lease), 403);

        $child = $this->renewals->renew($lease, $request->validated(), $user);

        return $this->json([
            'data' => LeaseResource::make($child->load(['property', 'tenant', 'renewedFrom']))->toArray($request),
        ], 201);
    }
}
