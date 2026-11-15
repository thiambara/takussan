<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Agency\AgencyMostViewedPropertiesRequest;
use App\Models\Agency;
use App\Models\Property;
use App\Services\Media\PublicPhotoUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2923 — les biens PUBLICS de l'agence les plus vus du mois civil en cours (UTC, le jour de
 * `PropertyViewCounter`), pour « Utiliser cette sélection » de la vitrine. Une seule source : les vues
 * datées `property_daily_views` (ADR-0117). « Public » est `Property::scopePublicPortfolio()`, le
 * prédicat de la vitrine (`AgencyShowcase`) : un brouillon, un bien hors ligne ou d'une autre agence n'y
 * est jamais. Un bien sans vue ce mois n'y est pas (jointure interne). Égalité : le plus récent d'abord.
 *
 * La ligne a la forme d'un `BienDeVitrine` du front, plus `views_month`.
 */
class AgencyMostViewedPropertiesController extends Controller
{
    public function __invoke(AgencyMostViewedPropertiesRequest $request, Agency $agency): JsonResponse
    {
        $views = DB::table('property_daily_views')
            ->where('day', '>=', now()->utc()->startOfMonth()->toDateString())
            ->groupBy('property_id')
            ->selectRaw('property_id, SUM(views) AS views_month');

        $properties = Property::query()
            ->publicPortfolio()
            ->where('properties.agency_id', $agency->getKey())
            ->joinSub($views, 'v', 'v.property_id', '=', 'properties.id')
            ->select('properties.*', 'v.views_month')
            ->orderByDesc('v.views_month')
            ->orderByDesc('properties.id')
            ->limit($request->integer('limit', AgencyMostViewedPropertiesRequest::LIMIT_DEFAULT))
            ->with(['media', 'agency'])
            ->get();

        return $this->json(['data' => $properties->map(static function (Property $property): array {
            $media = $property->getFirstMedia('photos');

            return [
                'id' => $property->id,
                'title' => $property->title,
                'reference_number' => $property->reference_number,
                'main_photo_url' => $media !== null
                    ? PublicPhotoUrl::upTo($media, 'preview', fn () => $property->requiresWatermark())
                    : null,
                'price' => $property->price !== null ? (float) $property->price : null,
                'currency' => $property->currency?->value,
                'contract_type' => $property->contract_type?->value,
                'rent_period' => $property->rent_period?->value,
                'views_month' => (int) $property->getAttribute('views_month'),
            ];
        })->values()]);
    }
}
