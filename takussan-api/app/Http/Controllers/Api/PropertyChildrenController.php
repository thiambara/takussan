<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-086 — `GET /api/properties/{property}/children`.
 *
 * Lists direct children of the parent property using the standard spatie
 * pipeline (`filter[]`, `sort=`, `include=`, `fields[properties]=`).
 */
class PropertyChildrenController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorizeAccess($request, $property);

        $base = Property::query()->where('parent_id', $property->id);

        $paginator = Property::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => PropertyResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    protected function authorizeAccess(Request $request, Property $property): void
    {
        $user = $request->user();
        if ($user->id === $property->user_id) {
            return;
        }
        if ($user->agency_id && $user->agency_id === $property->agency_id) {
            return;
        }
        if ($user->hasRole(['admin', 'super_admin'])) {
            return;
        }
        abort(403);
    }
}
