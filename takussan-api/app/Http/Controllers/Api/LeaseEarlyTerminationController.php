<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\RequestEarlyTerminationRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Lease;
use App\Services\Lease\EarlyTerminationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-090 — Three operations on the early-termination workflow:
 *   - `store`   POST   /api/leases/{lease}/early-termination
 *   - `destroy` DELETE /api/leases/{lease}/early-termination
 *   - `confirm` POST   /api/leases/{lease}/early-termination/confirm
 *
 * Authorization gates live on `LeasePolicy` so the same rules apply when an
 * agent is acting on behalf of a tenant (delegation flag) and so the
 * frontend can preflight via `Gate::check`.
 */
class LeaseEarlyTerminationController extends Controller
{
    public function __construct(protected EarlyTerminationService $service) {}

    public function store(RequestEarlyTerminationRequest $request, Lease $lease): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null && Gate::forUser($user)->allows('requestEarlyTermination', $lease), 403);

        $lease = $this->service->request($lease, $user, $request->validated());

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property', 'tenant', 'earlyTerminationInvoice']))->toArray($request),
        ], 201);
    }

    public function destroy(Request $request, Lease $lease): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null && Gate::forUser($user)->allows('cancelEarlyTermination', $lease), 403);

        $lease = $this->service->cancel($lease, $user);

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property', 'tenant']))->toArray($request),
        ]);
    }

    public function confirm(Request $request, Lease $lease): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null && Gate::forUser($user)->allows('confirmEarlyTermination', $lease), 403);

        $lease = $this->service->confirm($lease, $user);

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property', 'tenant', 'earlyTerminationInvoice']))->toArray($request),
        ]);
    }
}
