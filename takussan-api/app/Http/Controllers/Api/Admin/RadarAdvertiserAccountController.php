<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\ReleaseRadarAdvertiserAccountRequest;
use App\Models\RadarAdvertiser;
use App\Services\Radar\AdvertiserAccountRelease;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2413 (ADR-0077 §3, §11) — délier l'annonceur du compte supprimé que le Radar avait créé pour lui, pour qu'il puisse de
 * nouveau réclamer ses annonces. Gardé par `super-admin` + `platform-can:platform.radar.publish` (`routes/api/admin-radar.php`).
 */
class RadarAdvertiserAccountController extends Controller
{
    public function release(ReleaseRadarAdvertiserAccountRequest $request, RadarAdvertiser $advertiser, AdvertiserAccountRelease $release): JsonResponse
    {
        $done = $release->release($advertiser, $request->reason(), $request->user());

        return $this->json(['data' => [
            'advertiser_id' => $done['advertiser']->id,
            'previous_user_id' => $done['previous_user_id'],
        ]]);
    }
}
