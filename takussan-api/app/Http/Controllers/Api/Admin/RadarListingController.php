<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreRadarListingRequest;
use App\Http\Resources\Api\Admin\RadarListingResource;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarListing;
use App\Services\Radar\RadarListingIntake;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2386 (ADR-0077 §2) — la saisie et la liste du Radar. Toutes les routes sont gardées par
 * `super-admin` + `platform-can:platform.radar.operate` (`routes/api/admin-radar.php`).
 */
class RadarListingController extends Controller
{
    /**
     * 201 `{data: [{id, stage, existing, requeued}]}` — une ligne par URL, une seule pour un texte ou
     * des captures. `requeued` : une fiche connue dont l'extraction avait échoué, remise en file.
     */
    public function store(StoreRadarListingRequest $request, RadarListingIntake $intake): JsonResponse
    {
        $user = $request->user();
        $site = RadarSourceSite::tryFrom((string) $request->validated('source_site'));

        $results = match (true) {
            $request->validated('urls') !== null => $intake->fromUrls(array_values($request->validated('urls')), $user),
            $request->validated('captures') !== null => [$intake->fromCaptures(array_values($request->file('captures')), $site, $user)],
            default => [$intake->fromText((string) $request->validated('text'), $site, $user)],
        };

        return $this->json(['data' => array_map(fn (array $result): array => [
            'id' => $result['listing']->id,
            'stage' => $result['listing']->stage->value,
            'existing' => $result['existing'],
            'requeued' => $result['requeued'],
        ], $results)], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $paginator = RadarListing::buildQuery(null, $request)
            ->defaultSort('-created_at')
            ->paginate()
            ->withQueryString();

        return $this->paginated($paginator, RadarListingResource::collection($paginator)->toArray($request));
    }

    public function show(RadarListing $listing): JsonResponse
    {
        return $this->json(['data' => new RadarListingResource($listing->load(['advertiser', 'media']))]);
    }
}
