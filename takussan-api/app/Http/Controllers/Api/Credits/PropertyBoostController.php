<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Credits\StorePropertyBoostRequest;
use App\Http\Resources\Credits\PropertyBoostResource;
use App\Models\BoostProduct;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Http\JsonResponse;

/** TCK-633 lot F (ADR-0061 §5) — les boosts d'un bien, et l'achat d'un boost. */
class PropertyBoostController extends Controller
{
    public function index(Property $property, BoostPurchaseService $purchases): JsonResponse
    {
        $this->authorize('viewAny', [PropertyBoost::class, $property]);

        $boosts = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        // TCK-824 (P24.02) — le dialogue d'achat dit le délai de Remontée AVANT la confirmation.
        return $this->json([
            'data' => PropertyBoostResource::collection($boosts)->resolve(),
            'bump_available_at' => $purchases->bumpAvailableAt($property)?->toIso8601String(),
        ]);
    }

    public function store(StorePropertyBoostRequest $request, Property $property, BoostPurchaseService $purchases, CreditLedger $ledger): JsonResponse
    {
        $product = BoostProduct::query()->findOrFail($request->integer('product_id'));
        $boost = $purchases->purchase($property, $product, $request->user());

        return $this->json([
            'data' => PropertyBoostResource::make($boost->fresh())->resolve(),
            'balance' => $ledger->balance((int) $property->agency_id),
        ], 201);
    }
}
