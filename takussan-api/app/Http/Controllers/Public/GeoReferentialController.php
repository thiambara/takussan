<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Geo\GeoCitiesRequest;
use App\Http\Requests\Geo\GeoNeighborhoodsRequest;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\Tag;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/**
 * TCK-633 (ADR-0062) — les listes du référentiel géographique, publiques.
 *
 * ⚠ Aucun `cache.headers` : la liste des quartiers VARIE avec l'appelant (ses propositions), et
 * un cache partagé la servirait à un autre (cf. `CataloguePublicCacheTest`). L'appelant se lit par
 * `user('sanctum')` : la route n'exige pas de compte.
 */
class GeoReferentialController extends Controller
{
    private const TRI = 'name COLLATE "und-x-icu"';

    public function regions(): JsonResponse
    {
        $regions = GeoRegion::query()->orderByRaw(self::TRI)->get();

        return $this->json(['data' => $regions->map(fn (GeoRegion $r) => [
            'id' => $r->id,
            'name' => $r->name,
            'slug' => $r->slug,
        ])->values()]);
    }

    /**
     * TCK-633 (interface D → E) — le catalogue APPROUVÉ des équipements, pour les filtres publics.
     * Jamais une proposition, même celle de l'appelant : `/api/tags` sert ce cas, sous compte.
     */
    public function amenities(): JsonResponse
    {
        $equipements = Tag::query()
            ->where('type', TagType::Amenity->value)
            ->where('status', ReferentialStatus::Approved->value)
            ->orderByRaw(self::TRI)
            ->get(['id', 'name', 'slug']);

        return $this->json(['data' => $equipements->map(fn (Tag $t) => [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
        ])->values()]);
    }

    public function cities(GeoCitiesRequest $request): JsonResponse
    {
        $villes = GeoCity::query()
            ->when($request->validated('region') !== null, fn (Builder $q) => $q->where('geo_region_id', (int) $request->validated('region')))
            ->when(filled($request->validated('q')), fn (Builder $q) => $this->parNom($q, (string) $request->validated('q')))
            ->orderByRaw(self::TRI)
            ->get();

        return $this->json(['data' => $villes->map(fn (GeoCity $v) => $this->ville($v))->values()]);
    }

    public function city(GeoCity $city): JsonResponse
    {
        return $this->json(['data' => $this->ville($city)]);
    }

    public function neighborhoods(GeoNeighborhoodsRequest $request): JsonResponse
    {
        $quartiers = GeoNeighborhood::query()
            ->where('geo_city_id', (int) $request->validated('city'))
            ->visiblesPour($request->user('sanctum'))
            ->when(filled($request->validated('q')), fn (Builder $q) => $this->parNom($q, (string) $request->validated('q')))
            ->orderByRaw(self::TRI)
            ->get();

        return $this->json(['data' => $quartiers->map(fn (GeoNeighborhood $q) => [
            'id' => $q->id,
            'city_id' => $q->geo_city_id,
            'name' => $q->name,
            'slug' => $q->slug,
            'latitude' => $q->latitude !== null ? (float) $q->latitude : null,
            'longitude' => $q->longitude !== null ? (float) $q->longitude : null,
            'status' => $q->status->value,
        ])->values()]);
    }

    /** @return array<string, mixed> */
    private function ville(GeoCity $v): array
    {
        return [
            'id' => $v->id,
            'region_id' => $v->geo_region_id,
            'name' => $v->name,
            'slug' => $v->slug,
            'latitude' => $v->latitude !== null ? (float) $v->latitude : null,
            'longitude' => $v->longitude !== null ? (float) $v->longitude : null,
        ];
    }

    private function parNom(Builder $q, string $texte): Builder
    {
        $motif = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], CaseInsensitive::fold(trim($texte))).'%';

        return $q->whereRaw(CaseInsensitive::sql('name').' LIKE ?', [$motif]);
    }
}
