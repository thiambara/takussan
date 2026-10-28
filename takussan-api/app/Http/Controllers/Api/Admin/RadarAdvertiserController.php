<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\RadarAdvertiserResource;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Services\Radar\AdvertiserClaim;
use App\Services\Radar\RadarFollowUps;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * TCK-2388 (ADR-0077 §3, §4, §11) — les annonceurs du Radar : les files du démarchage, la fiche, et la prise en
 * charge. Toutes les routes sont gardées par `super-admin` + `platform-can:platform.radar.operate`
 * (`routes/api/admin-radar.php`). Lire ne demande pas de prise en charge ; les écritures du démarchage l'exigent
 * (`AdvertiserClaim::assertHeld()`).
 */
class RadarAdvertiserController extends Controller
{
    /** Les files : `filter[queue]=to_contact|awaiting|follow_up`, `filter[search]`, `filter[nature]`. */
    public function index(Request $request, RadarFollowUps $followUps): JsonResponse
    {
        $paginator = RadarAdvertiser::buildQuery(null, $request)
            // Comptes aliasés : un `withCount` sans alias nomme la colonne d'après la relation (piège n° 7).
            ->withCount([
                'listings as reviewed_count' => fn ($q) => $q->where('stage', RadarListingStage::Reviewed->value),
                'listings as contacted_count' => fn ($q) => $q->where('stage', RadarListingStage::Contacted->value),
                'listings as consented_count' => fn ($q) => $q->where('stage', RadarListingStage::Consented->value),
            ])
            ->with([
                'claimer:id,first_name,last_name,username',
                // Le message ouvert : celui de la file « à relancer », jamais un second calcul de la définition.
                'outreaches' => fn ($q) => $followUps->constrainOpen($q),
            ])
            ->defaultSort('-updated_at')
            ->paginate()
            ->withQueryString();

        return $this->paginated($paginator, RadarAdvertiserResource::collection($paginator)->toArray($request));
    }

    public function show(Request $request, RadarAdvertiser $advertiser): JsonResponse
    {
        $advertiser->load([
            'claimer:id,first_name,last_name,username',
            'listings',
            'outreaches.listings:id',
            'outreaches.creator:id,first_name,last_name,username',
            'outreaches.consents.confirmer:id,first_name,last_name,username',
            'outreaches.consents.media',
        ]);

        return $this->json(['data' => (new RadarAdvertiserResource($advertiser))->asCard()->resolve($request)]);
    }

    public function claim(Request $request, RadarAdvertiser $advertiser, AdvertiserClaim $claim): JsonResponse
    {
        $held = $claim->claim($advertiser, $request->user());

        return $this->json(['data' => ['claim' => RadarAdvertiserResource::claimOf($held, $request->user()->id)]]);
    }

    public function release(Request $request, RadarAdvertiser $advertiser, AdvertiserClaim $claim): Response
    {
        $claim->release($advertiser, $request->user());

        return response()->noContent();
    }
}
