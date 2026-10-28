<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreRadarOutreachRequest;
use App\Http\Requests\Api\Admin\UpdateRadarOutreachRequest;
use App\Http\Resources\Api\Admin\RadarOutreachResource;
use App\Models\RadarAdvertiser;
use App\Models\RadarOutreach;
use App\Services\Radar\RadarOutreachWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2388 (ADR-0077 §4, §11) — préparer, retoucher et marquer envoyé le message d'accord d'un annonceur. Chaque geste
 * rend le message ; la préparation y ajoute `generated` et `ai_error`. Gardés par `super-admin` +
 * `platform-can:platform.radar.operate` (`routes/api/admin-radar.php`) ; chacun exige la prise en charge de l'annonceur.
 */
class RadarOutreachController extends Controller
{
    public function store(StoreRadarOutreachRequest $request, RadarAdvertiser $advertiser, RadarOutreachWorkflow $workflow): JsonResponse
    {
        $prepared = $workflow->prepare($advertiser, $request->listingIds(), $request->followUpOfId(), $request->locale(), $request->user());

        return $this->json([
            'data' => $this->resource($prepared['outreach'])->withGeneration($prepared['generated'], $prepared['ai_error'])->resolve($request),
        ], 201);
    }

    public function update(UpdateRadarOutreachRequest $request, RadarOutreach $outreach, RadarOutreachWorkflow $workflow): JsonResponse
    {
        return $this->card($request, $workflow->retouch($outreach, $request->changes(), $request->user()));
    }

    public function sent(Request $request, RadarOutreach $outreach, RadarOutreachWorkflow $workflow): JsonResponse
    {
        return $this->card($request, $workflow->markSent($outreach, $request->user()));
    }

    private function card(Request $request, RadarOutreach $outreach): JsonResponse
    {
        return $this->json(['data' => $this->resource($outreach)->resolve($request)]);
    }

    private function resource(RadarOutreach $outreach): RadarOutreachResource
    {
        return new RadarOutreachResource($outreach->load([
            'advertiser',
            'listings:id',
            'creator:id,first_name,last_name,username',
            'consents.confirmer:id,first_name,last_name,username',
            'consents.media',
        ]));
    }
}
