<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\MarkPaidLeasePaymentRequest;
use App\Http\Requests\Api\StoreLeasePaymentRequest;
use App\Http\Resources\LeasePaymentResource;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Model\LeasePaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeasePaymentController extends Controller
{
    public function __construct(protected LeasePaymentService $payments) {}

    public function index(Request $request, Lease $lease): JsonResponse
    {
        // TCK-587 — la règle de `LeasePolicy::view`, à l'identique : l'ancien helper la recopiait.
        $this->authorize('view', $lease);

        $payments = $lease->payments()
            ->orderBy('period_start', 'desc')
            ->paginate((int) $request->input('per_page', 20));

        return $this->paginated($payments, LeasePaymentResource::collection($payments)->toArray($request));
    }

    public function store(StoreLeasePaymentRequest $request, Lease $lease): JsonResponse
    {

        $data = $request->validated();

        $payment = $this->payments->create($lease, $request->user(), $data);

        return $this->json([
            'data' => LeasePaymentResource::make($payment)->toArray($request),
        ], 201);
    }

    public function markPaid(MarkPaidLeasePaymentRequest $request, LeasePayment $payment): JsonResponse
    {
        $payment->loadMissing('lease');
        abort_unless($payment->lease, 404);

        $data = $request->validated();

        $payment = $this->payments->markPaid($payment, $data);

        return $this->json([
            'data' => LeasePaymentResource::make($payment)->toArray($request),
        ]);
    }
}
