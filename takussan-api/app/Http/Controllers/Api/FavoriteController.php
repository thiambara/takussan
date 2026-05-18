<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\FavoriteResource;
use App\Models\Enums\PropertyVisibility;
use App\Models\Favorite;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FavoriteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $favorites = Favorite::where('user_id', $request->user()->id)
            ->with('property.address')
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => FavoriteResource::collection($favorites)->toArray($request),
            'meta' => [
                'total' => $favorites->total(),
                'current_page' => $favorites->currentPage(),
                'last_page' => $favorites->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'property_id' => ['required', 'exists:properties,id'],
            'notes' => ['nullable', 'string'],
        ]);

        $user = $request->user();
        $property = Property::findOrFail($data['property_id']);
        $canSee = $property->visibility === PropertyVisibility::Public
            && $property->published_at !== null;
        $isStaff = $user->isSuperAdmin()
            || $property->user_id === $user->id
            || ($user->agency_id && $user->agency_id === $property->agency_id);
        abort_unless($canSee || $isStaff, 403);

        $favorite = Favorite::firstOrCreate(
            ['user_id' => $user->id, 'property_id' => $data['property_id']],
            ['notes' => $data['notes'] ?? null],
        );

        return $this->json([
            'data' => FavoriteResource::make($favorite->load('property'))->toArray($request),
        ], 201);
    }

    public function destroy(Request $request, Property $property): JsonResponse
    {
        Favorite::where('user_id', $request->user()->id)
            ->where('property_id', $property->id)
            ->delete();

        return $this->json(['message' => 'removed'], 204);
    }
}
