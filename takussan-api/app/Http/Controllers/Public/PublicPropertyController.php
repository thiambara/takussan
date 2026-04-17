<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PublicPropertyController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $properties = Property::query()
            ->with('address', 'media')
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->orderByDesc('featured')
            ->orderByDesc('published_at')
            ->paginate((int) $request->input('per_page', 20));

        return PropertyResource::collection($properties);
    }

    public function search(Request $request): array
    {
        $validated = $request->validate([
            'q' => 'nullable|string|max:200',
            'location' => 'nullable|string|max:100',
            'city' => 'nullable|string|max:100',
            'price_min' => 'nullable|numeric|min:0',
            'price_max' => 'nullable|numeric|min:0',
            'bedrooms' => 'nullable|integer|min:0|max:50',
            'bathrooms' => 'nullable|integer|min:0|max:50',
            'type' => 'nullable|string',
            'contract_type' => 'nullable|in:sale,rent',
            'furnished' => 'nullable|boolean',
            'sort' => 'nullable|in:relevance,price_asc,price_desc,created_desc',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = Property::query()
            ->with('address', 'media')
            ->public()
            ->whereNot('status', PropertyStatus::Draft);

        if (! empty($validated['q'])) {
            $query->where(function ($q) use ($validated) {
                $q->where('title', 'like', '%'.$validated['q'].'%')
                    ->orWhere('description', 'like', '%'.$validated['q'].'%');
            });
        }

        if (! empty($validated['location']) || ! empty($validated['city'])) {
            $query->whereHas('address', function ($q) use ($validated) {
                if (! empty($validated['location'])) {
                    $q->where('neighborhood', $validated['location']);
                }
                if (! empty($validated['city'])) {
                    $q->where('city', $validated['city']);
                }
            });
        }

        if (! empty($validated['price_min'])) {
            $query->where('price', '>=', $validated['price_min']);
        }
        if (! empty($validated['price_max'])) {
            $query->where('price', '<=', $validated['price_max']);
        }
        if (isset($validated['bedrooms'])) {
            $query->where('bedrooms', $validated['bedrooms']);
        }
        if (isset($validated['bathrooms'])) {
            $query->where('bathrooms', $validated['bathrooms']);
        }
        if (! empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }
        if (! empty($validated['contract_type'])) {
            $query->where('contract_type', $validated['contract_type']);
        }
        if (array_key_exists('furnished', $validated) && $validated['furnished'] !== null) {
            $query->where('furnished', $validated['furnished']);
        }

        $facets = [
            'locations' => (clone $query)
                ->join('addresses', function ($join) {
                    $join->on('addresses.addressable_id', '=', 'properties.id')
                        ->where('addresses.addressable_type', '=', Property::class);
                })
                ->selectRaw('addresses.neighborhood as label, count(*) as cnt')
                ->whereNotNull('addresses.neighborhood')
                ->groupBy('addresses.neighborhood')
                ->pluck('cnt', 'label')
                ->toArray(),
            'bedrooms' => (clone $query)
                ->selectRaw('bedrooms, count(*) as cnt')
                ->whereNotNull('bedrooms')
                ->groupBy('bedrooms')
                ->pluck('cnt', 'bedrooms')
                ->toArray(),
            'types' => (clone $query)
                ->selectRaw('type, count(*) as cnt')
                ->groupBy('type')
                ->pluck('cnt', 'type')
                ->toArray(),
        ];

        $sort = $validated['sort'] ?? 'relevance';
        match ($sort) {
            'price_asc' => $query->orderBy('price'),
            'price_desc' => $query->orderByDesc('price'),
            'created_desc' => $query->orderByDesc('created_at'),
            default => $query->orderByDesc('featured')->orderByDesc('published_at'),
        };

        $paginated = $query->paginate((int) ($validated['per_page'] ?? 20), ['*'], 'page', $validated['page'] ?? 1);

        return [
            'data' => PropertyResource::collection($paginated)->resolve(),
            'facets' => $facets,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ];
    }

    public function show(string $slug): PropertyResource
    {
        $property = Property::query()
            ->with('address', 'media', 'tags', 'owner', 'agency')
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', $slug)
            ->firstOrFail();

        $property->increment('views_count');

        return new PropertyResource($property);
    }

    public function contact(string $slug): JsonResponse
    {
        $property = Property::query()
            ->with('owner', 'address')
            ->public()
            ->where('slug', $slug)
            ->firstOrFail();

        $address = $property->address;
        $location = $address
            ? trim(($address->neighborhood ? $address->neighborhood.', ' : '').$address->city)
            : '';

        $message = "Bonjour, je suis intéressé(e) par votre bien :\n"
            ."{$property->title}\n"
            .number_format((float) $property->price, 0, ',', ' ').' FCFA'
            .($location ? " - {$location}" : '')."\n"
            .'Vu sur Takussan.sn';

        return $this->json([
            'phone' => $property->owner?->phone,
            'message' => $message,
        ]);
    }
}
