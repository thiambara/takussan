<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\RadarObservatoryRequest;
use App\Http\Resources\Api\Admin\RadarAdvertiserRankingResource;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Services\Radar\Observatory\RadarAdvertiserRanking;
use App\Services\Radar\Observatory\RadarObservatory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2393 (ADR-0083) — l'observatoire du marché et le classement des annonceurs du Radar, en lecture seule. Gardé par
 * `super-admin` + `platform-can:platform.radar.operate` (`routes/api/admin-radar.php`).
 */
class RadarObservatoryController extends Controller
{
    /** Les sections du marché : `fields[radar_observatory]`, filtres `filter[since|contract|property_type|source_site|neighborhood_id]`. */
    public function market(RadarObservatoryRequest $request, RadarObservatory $observatory): JsonResponse
    {
        return $this->json(['data' => $observatory->compute($request->sections(), $request->filters())]);
    }

    /** Le classement : `fields[radar_advertisers]`, `filter[nature|search]`, `sort` (défaut `-listings_count`). */
    public function advertisers(Request $request, RadarAdvertiserRanking $ranking): JsonResponse
    {
        $query = RadarAdvertiser::buildQuery(
            RadarAdvertiser::query()->whereHas('listings', fn (Builder $q) => RadarAdvertiserRanking::liveListings($q)),
            $request,
        );

        // La piste commerciale lit ces colonnes, demandées ou non par `fields[]` (même motif que la prise en charge des files).
        if ($query->getQuery()->columns !== null) {
            $query->addSelect(['radar_advertisers.id', 'radar_advertisers.user_id', 'radar_advertisers.do_not_contact_at']);
        }

        $paginator = $query
            // Comptes aliasés : un `withCount` sans alias nomme la colonne d'après la relation (piège n° 7).
            ->withCount([
                'listings as listings_count' => fn ($q) => RadarAdvertiserRanking::liveListings($q),
                'listings as published_count' => fn ($q) => $q->whereNotNull((new RadarListing)->qualifyColumn('property_id')),
                'outreaches as outreaches_count',
            ])
            ->defaultSort('-listings_count')
            ->paginate()
            ->withQueryString();

        $details = $ranking->detailsFor($paginator->getCollection());
        $rows = $paginator->getCollection()
            ->map(fn (RadarAdvertiser $advertiser) => (new RadarAdvertiserRankingResource($advertiser))
                ->withDetails($details[$advertiser->id] ?? [])
                ->resolve($request))
            ->all();

        return $this->paginated($paginator, $rows);
    }
}
