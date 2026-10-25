<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Models\Agency;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RegenerateWatermarksController extends Controller
{
    public function __invoke(Request $request, Agency $agency): JsonResponse
    {
        // TCK-2311 (P225.04, décision du porteur) — jugé par `AgencyPolicy::configure`, comme le
        // logo : l'admin de l'agence qui tient `agency.update` (TCK-106 : « admin agence »),
        // l'administrateur principal et le super-admin. Le seul titre ne suffisait plus : sans
        // titulaire joignable, plus personne de l'agence ne tenait ce geste.
        abort_unless($request->user()->can('configure', $agency), 403);

        RegenerateAgencyWatermarksJob::dispatch($agency->id);

        return $this->json(['queued' => true, 'agency_id' => $agency->id], 202);
    }
}
