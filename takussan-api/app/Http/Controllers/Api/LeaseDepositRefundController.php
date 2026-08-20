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
 * The store endpoint is gated by the `LeasePolicy@refundDeposit` ability.
 *
 * TCK-278 — that ability now resolves through `Capability::LeasesRefundDeposit`
 * and the Gate derived from the enum (ADR-0003), not through a Spatie
 * permission: `spatie/laravel-permission` is uninstalled (ADR-0002). The
 * capability string is unchanged, which is exactly why the stale wording
 * survived — the name still reads true, the mechanism no longer exists.
 *
 * The show endpoint is open
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
        $this->authorize('view', $lease);

        return $this->json([
            'data' => $this->refunds->state($lease),
        ]);
    }
}
