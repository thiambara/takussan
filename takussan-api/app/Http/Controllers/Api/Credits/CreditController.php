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
        $agency = $this->walletAgency($request);

        $lots = CreditLot::query()->where('agency_id', $agency->getKey())->spendable()->inConsumptionOrder()->get();
        $movements = CreditMovement::query()
            ->where('agency_id', $agency->getKey())
            ->with(['boost:id,property_id,kind,variant', 'boost.property:id,title'])
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

    /**
     * TCK-642 — le SEUL solde, pour la pastille des barres de navigation : elle est lue à chaque
     * page, et ne doit payer ni les lots ni le journal de `show()`. Même espace, même autorisation.
     */
    public function balance(Request $request, CreditLedger $ledger): JsonResponse
    {
        $agency = $this->walletAgency($request);

        return $this->json(['data' => ['balance' => $ledger->balance($agency)]]);
    }

    /** L'espace ACTIF dont on lit le portefeuille, autorisé — 422 nommé quand il n'y en a pas. */
    private function walletAgency(Request $request): Agency
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()->agency_id;
        abort_code_if($agencyId === null, 422, 'credits.no_space');
        $agency = Agency::query()->findOrFail($agencyId);
        $this->authorize('viewAny', [CreditLot::class, $agency]);

        return $agency;
    }
}
