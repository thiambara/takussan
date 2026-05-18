<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\RefundDepositRequest;
use App\Http\Resources\LeaseResource;
use App\Models\Lease;
use App\Services\Lease\DepositRefundService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-088 — `POST /api/leases/{lease}/deposit-refund` and
 * `GET /api/leases/{lease}/deposit-refund`.
 *
 * The store endpoint is gated by the `LeasePolicy@refundDeposit` ability
 * (Spatie permission `leases.refund_deposit`). The show endpoint is open
 * to anyone with read access on the lease — including the tenant — so the
 * frontend banner can render for everyone involved.
 */
class LeaseDepositRefundController extends Controller
{
    public function __construct(protected DepositRefundService $refunds) {}

    public function store(RefundDepositRequest $request, Lease $lease): JsonResponse
    {
        abort_unless(Gate::forUser($request->user())->allows('refundDeposit', $lease), 403);

        $result = $this->refunds->refund($lease, $request->user(), $request->validated());

        return $this->json([
            'data' => [
                'lease' => LeaseResource::make($result['lease'])->toArray($request),
                'state' => $this->refunds->state($result['lease']),
                'payment_id' => $result['payment']->id,
                'payout_id' => $result['payout']->id,
                'invoice_id' => $result['invoice']?->id,
            ],
        ], 201);
    }

    public function show(Request $request, Lease $lease): JsonResponse
    {
        $this->authorizeAccess($request, $lease);

        return $this->json([
            'data' => $this->refunds->state($lease),
        ]);
    }

    /**
     * Mirrors `LeaseController::authorizeAccess` — kept private to this
     * controller to avoid forcing every caller to extend a shared base.
     */
    protected function authorizeAccess(Request $request, Lease $lease): void
    {
        $user = $request->user();
        $ok = $user->isSuperAdmin()
            || $lease->landlord_id === $user->id
            || ($user->agency_id && $user->agency_id === $lease->agency_id)
            || ($lease->tenant && $lease->tenant->user_id === $user->id);

        abort_unless($ok, 403);
    }
}
