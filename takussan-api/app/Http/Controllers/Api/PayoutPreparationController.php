<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\PreparePayoutRequest;
use App\Models\User;
use App\Services\Payout\PayoutPreparationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/**
 * TCK-594 (ADR-0039 §3) — la lecture qui précède un reversement : lignes éligibles, commission,
 * frais, net. Le brut n'est plus un champ.
 */
class PayoutPreparationController extends Controller
{
    public function __construct(private readonly PayoutPreparationService $preparation) {}

    public function show(PreparePayoutRequest $request): JsonResponse
    {
        $data = $request->validated();

        return $this->json([
            'data' => $this->preparation->prepare(
                $request->user(),
                User::query()->findOrFail($data['landlord_id']),
                Carbon::parse($data['period_start']),
                Carbon::parse($data['period_end']),
                isset($data['agency_id']) ? (int) $data['agency_id'] : null,
            ),
        ]);
    }
}
