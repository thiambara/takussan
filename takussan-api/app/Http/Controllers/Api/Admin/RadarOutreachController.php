<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\RecordRadarOutreachOutcomeRequest;
use App\Http\Requests\Api\Admin\StoreRadarConsentReplyRequest;
use App\Http\Requests\Api\Admin\StoreRadarOutreachRequest;
use App\Http\Requests\Api\Admin\UpdateRadarOutreachRequest;
use App\Http\Resources\Api\Admin\RadarConsentResource;
use App\Http\Resources\Api\Admin\RadarOutreachResource;
use App\Models\RadarAdvertiser;
use App\Models\RadarOutreach;
use App\Services\Radar\RadarConsentWorkflow;
use App\Services\Radar\RadarOutreachWorkflow;
use App\Services\Radar\Whatsapp\RadarWhatsappOutreach;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2388 (ADR-0077 §4, §11) — préparer, retoucher et marquer envoyé le message d'accord d'un annonceur, déposer la réponse qu'il a donnée et poser l'issue. Chaque geste
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

    /**
     * TCK-2395 (ADR-0077 §5) — « Envoyer par l'API » : le gabarit Meta part du numéro dédié au Radar, et le message passe
     * envoyé comme par « J'ai envoyé ». 502 `radar.whatsapp.send_failed` sur un refus franc de Meta : rien n'est écrit.
     */
    public function send(Request $request, RadarOutreach $outreach, RadarWhatsappOutreach $whatsapp): JsonResponse
    {
        return $this->card($request, $whatsapp->send($outreach, $request->user()));
    }

    /** 201 : la réponse déposée, `pending` ; la vérification par l'IA part en file après le commit. */
    public function reply(StoreRadarConsentReplyRequest $request, RadarOutreach $outreach, RadarConsentWorkflow $workflow): JsonResponse
    {
        $consent = $workflow->depositReply($outreach, $request->captures(), $request->user());

        return $this->json([
            'data' => (new RadarConsentResource($consent->load(['confirmer:id,first_name,last_name,username', 'media'])))->resolve($request),
        ], 201);
    }

    /** 200 : le message, issue et réponses comprises. Le seul geste qui confirme une réponse (ADR-0077 §3). */
    public function outcome(RecordRadarOutreachOutcomeRequest $request, RadarOutreach $outreach, RadarConsentWorkflow $workflow): JsonResponse
    {
        return $this->card($request, $workflow->recordOutcome($outreach, $request->outcome(), $request->reason(), $request->user()));
    }

    private function card(Request $request, RadarOutreach $outreach): JsonResponse
    {
        return $this->json(['data' => $this->resource($outreach)->resolve($request)]);
    }

    private function resource(RadarOutreach $outreach): RadarOutreachResource
    {
        return new RadarOutreachResource($outreach->load([
            'advertiser',
            'listings:id,radar_advertiser_id,stage',
            'followUpOf:id,outcome',
            'creator:id,first_name,last_name,username',
            'consents.confirmer:id,first_name,last_name,username',
            'consents.media',
        ]));
    }
}
