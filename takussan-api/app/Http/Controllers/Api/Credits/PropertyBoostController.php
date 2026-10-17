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
    public function index(Property $property): JsonResponse
    {
        $this->authorize('viewAny', [PropertyBoost::class, $property]);

        $boosts = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return $this->json(['data' => PropertyBoostResource::collection($boosts)->resolve()]);
    }

    public function store(StorePropertyBoostRequest $request, Property $property, BoostPurchaseService $purchases, CreditLedger $ledger): JsonResponse
    {
        $product = BoostProduct::query()->findOrFail($request->integer('product_id'));
        $achat = $purchases->purchaseOnce($property, $product, $request->user(), $request->idempotencyKey());

        // TCK-822 : un rejeu par la même clé rend 200 et le boost déjà écrit, sans second débit.
        return $this->json([
            'data' => PropertyBoostResource::make($achat->boost->fresh())->resolve(),
            'balance' => $ledger->balance((int) $property->agency_id),
        ], $achat->replayed ? 200 : 201);
    }
}
