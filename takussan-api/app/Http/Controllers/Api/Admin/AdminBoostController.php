<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\CancelBoostRequest;
use App\Http\Requests\Api\Admin\OfferBoostRequest;
use App\Http\Resources\Credits\PropertyBoostResource;
use App\Models\BoostProduct;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostLifecycle;
use App\Services\Boost\BoostPurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §5, AC16) — les boosts du parc : lecture, annulation, Vedette offerte. */
class AdminBoostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filtres = (array) $request->input('filter', []);
        $paginator = PropertyBoost::query()
            ->with(['property:id,title,slug', 'agency:id,name'])
            ->when(BoostStatus::tryFrom((string) ($filtres['status'] ?? '')), fn ($q, BoostStatus $s) => $q->where('status', $s))
            ->when(BoostKind::tryFrom((string) ($filtres['kind'] ?? '')), fn ($q, BoostKind $k) => $q->where('kind', $k))
            ->when(isset($filtres['agency_id']) && ctype_digit((string) $filtres['agency_id']), fn ($q) => $q->where('agency_id', (int) $filtres['agency_id']))
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))));

        return $this->paginated($paginator, PropertyBoostResource::collection($paginator->items())->resolve());
    }

    public function cancel(CancelBoostRequest $request, PropertyBoost $boost, BoostLifecycle $lifecycle): JsonResponse
    {
        $reason = (string) $request->validated('reason');
        $refund = $request->boolean('refund');
        $result = $lifecycle->cancel($boost, $refund, $request->user(), $reason);

        activity('Boost')
            ->performedOn($result)
            ->causedBy($request->user())
            ->withProperties(['boost_id' => $result->id, 'refund' => $refund, 'refunded_credits' => $result->refunded_credits, 'reason' => $reason])
            ->event('super_admin_boost_cancelled')
            ->log('Mise en avant annulée');

        return $this->json(['data' => PropertyBoostResource::make($result)->resolve()]);
    }

    public function offer(OfferBoostRequest $request, Property $property, BoostPurchaseService $purchases): JsonResponse
    {
        $product = BoostProduct::query()->findOrFail($request->integer('product_id'));
        $reason = (string) $request->validated('reason');
        $boost = $purchases->offerFeatured($property, $product, $request->user(), $reason);

        activity('Boost')
            ->performedOn($boost)
            ->causedBy($request->user())
            ->withProperties(['boost_id' => $boost->id, 'property_id' => $property->id, 'duration_days' => $product->duration_days, 'reason' => $reason])
            ->event('super_admin_boost_offered')
            ->log('Vedette offerte');

        return $this->json(['data' => PropertyBoostResource::make($boost->fresh())->resolve()], 201);
    }
}
