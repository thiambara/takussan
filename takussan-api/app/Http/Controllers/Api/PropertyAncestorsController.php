<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Property;
use App\Services\Property\HierarchyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-086 — `GET /api/properties/{property}/ancestors`.
 *
 * Returns the chain of ancestors for the property, ordered from the closest
 * parent to the root. Useful for breadcrumbs.
 */
class PropertyAncestorsController extends Controller
{
    public function index(Request $request, Property $property, HierarchyService $hierarchy): JsonResponse
    {
        $this->authorize('view', $property);

        $chain = $hierarchy->ancestors($property);

        return $this->json([
            'data' => PropertyResource::collection($chain)->toArray($request),
        ]);
    }
}
