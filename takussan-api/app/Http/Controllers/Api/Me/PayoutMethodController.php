<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\StorePayoutMethodBankStatementRequest;
use App\Http\Requests\Api\Me\StorePayoutMethodRequest;
use App\Http\Requests\Api\Me\UpdatePayoutMethodRequest;
use App\Http\Resources\PayoutMethodResource;
use App\Models\PayoutMethod;
use App\Models\Profiles\OwnerProfile;
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
            ->with(['verifications', 'media']) // TCK-2863 — `media` : le RIB, chargé une fois
            ->where('user_id', $request->user()->id)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get();

        // TCK-2909 — le jour de versement du mandat (« reversements du N de chaque mois »), quand le
        // profil actif est un bailleur dont l'agence l'a réglé ; `null` sinon. Il vaut pour l'agence de
        // ce profil, les moyens de versement pour le compte.
        $active = $request->activeProfile();

        return $this->json([
            'data' => PayoutMethodResource::collection($methods)->resolve($request),
            'meta' => ['payout_day' => $active instanceof OwnerProfile ? $active->payout_day : null],
        ]);
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

    /**
     * TCK-2863 — `POST /api/me/payout-methods/{payoutMethod}/bank-statement` : le RIB d'un compte
     * bancaire du titulaire, sous step-up 2FA comme les autres écritures (TCK-589).
     */
    public function bankStatement(StorePayoutMethodBankStatementRequest $request, PayoutMethod $payoutMethod): JsonResponse
    {
        $method = $this->methods->attachBankStatement($payoutMethod, $request->file('file'));

        return $this->json(['data' => PayoutMethodResource::make($method)->resolve($request)], 201);
    }

    public function destroy(Request $request, PayoutMethod $payoutMethod): JsonResponse
    {
        abort_unless($request->user()->can('delete', $payoutMethod), 403);
        $this->methods->delete($payoutMethod);

        return $this->json(null, 204);
    }
}
