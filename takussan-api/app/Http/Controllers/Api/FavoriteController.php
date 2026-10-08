<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreFavoriteRequest;
use App\Http\Resources\FavoriteResource;
use App\Models\Enums\PropertyVisibility;
use App\Models\Favorite;
use App\Models\Property;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FavoriteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $agenceDuPersonnel = $user->staffAgencyId();

        // TCK-600 (ADR-0048 §1, verif-600 m3) — le favori d'un bien dont l'agence est hors ligne est
        // MASQUÉ, pas supprimé : il revient à la levée. Le personnel de cette agence le garde.
        $favorites = Favorite::where('user_id', $user->id)
            ->whereHas('property', fn (Builder $bien) => $bien->where(fn (Builder $q) => $q
                ->ofPublicAgency()
                ->when($agenceDuPersonnel !== null, fn (Builder $q) => $q->orWhere('properties.agency_id', $agenceDuPersonnel))))
            ->with('property.address')
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        return $this->paginated($favorites, FavoriteResource::collection($favorites)->toArray($request));
    }

    public function store(StoreFavoriteRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = $request->user();
        $property = Property::findOrFail($data['property_id']);
        $canSee = $property->visibility === PropertyVisibility::Public
            && $property->published_at !== null
            && $property->agencyIsPublic();
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
