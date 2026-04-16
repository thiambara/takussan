<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
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
