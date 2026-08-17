<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Property;
use App\Models\PropertyPriceHistory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PropertyPriceHistoryController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorizeAccess($request, $property);

        $paginator = $property->priceHistory()
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => $paginator->getCollection()->map(fn (PropertyPriceHistory $h) => [
                'id' => $h->id,
                'old_price' => (float) $h->old_price,
                'new_price' => (float) $h->new_price,
                'currency' => $h->currency?->value,
                'reason' => $h->reason?->value,
                'notes' => $h->notes,
                'changed_at' => $h->changed_at?->toISOString(),
                'changed_by_id' => $h->changed_by_id,
            ])->values(),
            'meta' => $this->paginationMeta($paginator),
        ]);
    }

    protected function authorizeAccess(Request $request, Property $property): void
    {
        $user = $request->user();
        $ok = $user->isSuperAdmin()
            || $property->user_id === $user->id
            || ($user->agency_id && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }
}
