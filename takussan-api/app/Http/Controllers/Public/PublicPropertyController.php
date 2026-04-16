<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PublicPropertyController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $properties = Property::published()
            ->orderByDesc('featured')
            ->orderByDesc('published_at')
            ->paginate(20);

        return PropertyResource::collection($properties);
    }

    public function search(Request $request): array
    {
        $validated = $request->validate([
            'location'  => 'nullable|string|max:100',
            'price_min' => 'nullable|integer|min:0',
            'price_max' => 'nullable|integer|min:0',
            'bedrooms'  => 'nullable|integer|min:1|max:10',
            'sort'      => 'nullable|in:relevance,price_asc,price_desc,created_desc',
            'page'      => 'nullable|integer|min:1',
        ]);

        $query = Property::published();

        if (!empty($validated['location'])) {
            $query->where('location_quarter', $validated['location']);
        }
        if (!empty($validated['price_min'])) {
            $query->where('price', '>=', $validated['price_min']);
        }
        if (!empty($validated['price_max'])) {
            $query->where('price', '<=', $validated['price_max']);
        }
        if (!empty($validated['bedrooms'])) {
            $query->where('bedrooms', $validated['bedrooms']);
        }

        // Facets (calculées avant pagination)
        $facets = [
            'locations' => (clone $query)
                ->selectRaw('location_quarter, count(*) as cnt')
                ->groupBy('location_quarter')
                ->pluck('cnt', 'location_quarter')
                ->toArray(),
            'bedrooms' => (clone $query)
                ->selectRaw('bedrooms, count(*) as cnt')
                ->whereNotNull('bedrooms')
                ->groupBy('bedrooms')
                ->pluck('cnt', 'bedrooms')
                ->toArray(),
        ];

        $sort = $validated['sort'] ?? 'relevance';
        match ($sort) {
            'price_asc'    => $query->orderBy('price'),
            'price_desc'   => $query->orderByDesc('price'),
            'created_desc' => $query->orderByDesc('created_at'),
            default        => $query->orderByDesc('featured')->orderByDesc('published_at'),
        };

        $paginated = $query->paginate(20, page: $validated['page'] ?? 1);

        return [
            'data'   => PropertyResource::collection($paginated)->resolve(),
            'facets' => $facets,
            'meta'   => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ];
    }

    public function show(string $slug): PropertyResource
    {
        $property = Property::published()
            ->where('slug', $slug)
            ->firstOrFail();

        return new PropertyResource($property);
    }

    public function contact(string $slug): JsonResponse
    {
        $property = Property::published()
            ->where('slug', $slug)
            ->firstOrFail();

        $message = "Bonjour, je suis intéressé(e) par votre bien :\n"
            ."{$property->title}\n"
            .number_format($property->price, 0, ',', ' ')." FCFA - {$property->location_quarter}, {$property->location_city}\n"
            .'Vu sur Takussan.sn';

        return response()->json([
            'phone' => $property->owner_phone,
            'message' => $message,
        ]);
    }
}
