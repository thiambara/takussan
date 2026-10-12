<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Credits\CreditLotResource;
use App\Http\Resources\Credits\CreditMovementResource;
use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Services\Credits\CreditLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-633 lot F (ADR-0061 §1) — le portefeuille de l'espace ACTIF : solde, lots vivants dans
 * l'ordre de consommation, journal paginé. Forme fixe (pas de `fields[...]`) : l'écran lit tout.
 */
class CreditController extends Controller
{
    public function show(Request $request, CreditLedger $ledger): JsonResponse
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()->agency_id;
        abort_code_if($agencyId === null, 422, 'credits.no_space');
        $agency = Agency::query()->findOrFail($agencyId);
        $this->authorize('viewAny', [CreditLot::class, $agency]);

        $lots = CreditLot::query()->where('agency_id', $agency->getKey())->spendable()->inConsumptionOrder()->get();
        $movements = CreditMovement::query()
            ->where('agency_id', $agency->getKey())
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 20))));

        return $this->json([
            'data' => [
                'balance' => $ledger->balance($agency),
                'lots' => CreditLotResource::collection($lots)->resolve(),
            ],
            'movements' => CreditMovementResource::collection($movements->items())->resolve(),
            'meta' => $this->paginationMeta($movements),
        ]);
    }
}
