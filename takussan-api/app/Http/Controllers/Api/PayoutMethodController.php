<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ListPayoutMethodsRequest;
use App\Http\Requests\Api\VerifyPayoutMethodRequest;
use App\Http\Resources\PayoutMethodResource;
use App\Models\PayoutMethod;
use App\Services\Payout\PayoutMethodService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-594 (ADR-0039 §6) — côté agence : lire (masquées) les destinations d'un bailleur ou d'un
 * prestataire qu'elle paie, et les vérifier.
 */
class PayoutMethodController extends Controller
{
    public function __construct(private readonly PayoutMethodService $methods) {}

    public function index(ListPayoutMethodsRequest $request): JsonResponse
    {
        $methods = PayoutMethod::query()
            ->with('verifications')
            ->where('user_id', (int) $request->input('filter.user_id'))
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get();

        return $this->json(['data' => PayoutMethodResource::collection($methods)->resolve($request)]);
    }

    public function verify(VerifyPayoutMethodRequest $request, PayoutMethod $payoutMethod): JsonResponse
    {
        $method = $this->methods->verify($payoutMethod, $request->user());

        return $this->json(['data' => PayoutMethodResource::make($method)->resolve($request)]);
    }
}
