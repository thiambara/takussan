<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\IndexFavoriteRequest;
use App\Http\Requests\Api\StoreFavoriteRequest;
use App\Http\Requests\Api\UpdateFavoriteRequest;
use App\Http\Resources\FavoriteResource;
use App\Models\Favorite;
use App\Models\Property;
use App\Services\Media\WatermarkRequirement;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-599 §1 — un favori ne décrit que ce que la liste publique décrirait.
 *
 * « Public » se juge en APPELANT `Property::scopePublic()` (par `withExists`), jamais par une
 * copie de ses conditions : la copie partielle qui vivait dans `store()` (visibilité et date de
 * publication, sans le statut ni `is_test`) laissait ajouter — et servir en 201 avec sa carte
 * complète — un bien en attente, refusé ou de test. Un filtre ajouté demain à `scopePublic()`
 * s'applique ici sans retouche.
 */
class FavoriteController extends Controller
{
    /**
     * Ce que la carte lit (`PropertyCard`), plus ce que la disponibilité juge (`status`,
     * `visibility`, `is_test`, `published_at`, `deleted_at`) et ce que la photo et le filigrane
     * relisent (`agency_id`). `PropertyResource` émet ses colonnes par `whenHas` : une colonne
     * absente d'ici sort absente, jamais fausse.
     */
    private const CARD_COLUMNS = [
        'id', 'user_id', 'agency_id', 'title', 'slug', 'price', 'currency', 'type', 'contract_type',
        'rent_period', 'condition', 'status', 'visibility', 'is_test', 'bedrooms', 'bathrooms',
        'area', 'published_at', 'created_at', 'deleted_at',
    ];

    public function index(IndexFavoriteRequest $request): JsonResponse
    {
        $user = $request->user();
        $agenceDuPersonnel = $user->staffAgencyId();

        // TCK-600 (ADR-0048 §1, verif-600 m3) — le favori d'un bien dont l'agence est hors ligne est
        // MASQUÉ, pas supprimé : il revient à la levée. Le personnel de cette agence le garde.
        // TCK-599 — `withTrashed()` : un bien supprimé reste une carte éteinte, pas un favori perdu.
        $favorites = $this->projected(Favorite::query()->where('user_id', $user->id)
            ->whereHas('property', fn (Builder $bien) => $bien->withTrashed()->where(fn (Builder $q) => $q
                ->ofPublicAgency()
                ->when($agenceDuPersonnel !== null, fn (Builder $q) => $q->orWhere('properties.agency_id', $agenceDuPersonnel)))))
            ->latest()
            ->latest('id')
            ->paginate((int) $request->validated('per_page', 20));

        WatermarkRequirement::attach($favorites->getCollection()->pluck('property')->filter());

        return $this->paginated($favorites, FavoriteResource::collection($favorites)->toArray($request));
    }

    /**
     * Contrainte 11 — même juge que la liste (`Property::public()` ou `can('view')`, la policy de
     * TCK-587), et la MÊME réponse pour un identifiant inexistant et un bien non visible.
     */
    public function store(StoreFavoriteRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = $request->user();
        $propertyId = (int) $data['property_id'];

        if (! Property::query()->public()->whereKey($propertyId)->exists()) {
            $property = Property::query()->find($propertyId);
            abort_unless($property !== null && $user->can('view', $property), 404);
        }

        $favorite = Favorite::firstOrCreate(
            ['user_id' => $user->id, 'property_id' => $propertyId],
            ['notes' => $data['notes'] ?? null],
        );

        return $this->json([
            'data' => FavoriteResource::make($this->reload($favorite))->toArray($request),
        ], 201);
    }

    /** La note personnelle ; un bien que l'appelant n'a pas en favori rend 404. */
    public function update(UpdateFavoriteRequest $request, Property $property): JsonResponse
    {
        $favorite = Favorite::query()
            ->where('user_id', $request->user()->id)
            ->where('property_id', $property->id)
            ->first();
        abort_if($favorite === null, 404);

        $favorite->update(['notes' => $request->validated('notes')]);

        return $this->json([
            'data' => FavoriteResource::make($this->reload($favorite))->toArray($request),
        ]);
    }

    /** La route lie le bien `withTrashed()` : le favori d'un bien supprimé se retire encore. */
    public function destroy(Request $request, Property $property): JsonResponse
    {
        Favorite::where('user_id', $request->user()->id)
            ->where('property_id', $property->id)
            ->delete();

        return $this->json(['message' => 'removed'], 204);
    }

    private function reload(Favorite $favorite): Favorite
    {
        return $this->projected(Favorite::query()->whereKey($favorite->getKey()))->firstOrFail();
    }

    /**
     * La projection commune à la liste, à l'ajout et à la note : le drapeau `property_is_public`
     * calculé par `scopePublic()`, et le bien chargé MÊME supprimé (sinon un bien supprimé et un
     * favori orphelin se confondraient), limité aux colonnes de la carte, avec son adresse et ses
     * médias — `main_photo_url` lit `getFirstMedia()`, une requête par favori sans eux.
     *
     * @param  Builder<Favorite>  $query
     * @return Builder<Favorite>
     */
    private function projected(Builder $query): Builder
    {
        return $query
            ->withExists(['property as property_is_public' => fn (Builder $q) => $q->public()])
            ->with(['property' => fn (BelongsTo $q) => $q->withTrashed()
                ->select(array_map(fn (string $colonne) => 'properties.'.$colonne, self::CARD_COLUMNS))
                ->with(['address', 'media'])]);
    }
}
