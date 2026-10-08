<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\MarkLateFeePaidRequest;
use App\Http\Requests\Api\MarkPaidLeasePaymentRequest;
use App\Http\Requests\Api\StoreLeasePaymentRequest;
use App\Http\Resources\LeasePaymentResource;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Lease\LateFeeSettlement;
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

        // TCK-593 — `amount_due` lit le réglage de l'agence du bail : un bail, une agence, chargés
        // une fois pour toute la page plutôt qu'une fois par échéance.
        $payments->getCollection()->each->setRelation('lease', $lease->loadMissing('agency'));

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

        $payment = $this->payments->markPaid($payment, $data, $request->user());

        return $this->json([
            'data' => LeasePaymentResource::make($payment)->toArray($request),
        ]);
    }

    /**
     * TCK-593 — l'agence enregistre une pénalité de retard réglée chez elle. 409
     * `late_fee_not_due` s'il n'en reste aucune.
     */
    public function markLateFeePaid(MarkLateFeePaidRequest $request, LeasePayment $payment, LateFeeSettlement $settlement): JsonResponse
    {
        $payment = $settlement->markPaid($payment, $request->user(), $request->validated());

        return $this->json([
            'data' => LeasePaymentResource::make($payment->refresh())->toArray($request),
        ]);
    }
}
