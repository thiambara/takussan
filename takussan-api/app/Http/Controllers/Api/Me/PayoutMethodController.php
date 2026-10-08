<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\StorePayoutMethodRequest;
use App\Http\Requests\Api\Me\UpdatePayoutMethodRequest;
use App\Http\Resources\PayoutMethodResource;
use App\Models\PayoutMethod;
use App\Services\Payout\PayoutMethodService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-594 (ADR-0039 §6) — les destinations de paiement du titulaire connecté.
 */
class PayoutMethodController extends Controller
{
    public function __construct(private readonly PayoutMethodService $methods) {}

    public function index(Request $request): JsonResponse
    {
        $methods = PayoutMethod::query()
            ->with('verifications')
            ->where('user_id', $request->user()->id)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get();

        return $this->json(['data' => PayoutMethodResource::collection($methods)->resolve($request)]);
    }

    public function store(StorePayoutMethodRequest $request): JsonResponse
    {
        $method = $this->methods->create($request->user(), $request->validated());

        return $this->json(['data' => PayoutMethodResource::make($method)->resolve($request)], 201);
    }

    public function update(UpdatePayoutMethodRequest $request, PayoutMethod $payoutMethod): JsonResponse
    {
        $method = $this->methods->update($payoutMethod, $request->validated());

        return $this->json(['data' => PayoutMethodResource::make($method)->resolve($request)]);
    }

    public function destroy(Request $request, PayoutMethod $payoutMethod): JsonResponse
    {
        abort_unless($request->user()->can('delete', $payoutMethod), 403);
        $this->methods->delete($payoutMethod);

        return $this->json(null, 204);
    }
}
