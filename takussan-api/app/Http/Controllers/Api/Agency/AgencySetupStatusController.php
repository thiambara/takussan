<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Policies\AgencyPolicy;
use App\Services\Agency\AgencySetupStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-589 §7 — `GET /api/agencies/{agency}/setup-status` : la carte « Mise en
 * service » de `/admin`.
 *
 * Autorisé par la règle `agency.update` DANS l'agence, telle que l'écrit
 * {@see AgencyPolicy::update()} — et non par `canActAt(Capability::AgencyUpdate)`,
 * qui n'exige pas que le profil actif soit sur l'agence visée (la policy dit
 * pourquoi). Un agent de l'agence reçoit donc 403 : la mise en service est le
 * travail de qui administre.
 */
class AgencySetupStatusController extends Controller
{
    public function __invoke(Request $request, Agency $agency, AgencySetupStatus $status): JsonResponse
    {
        abort_unless($request->user()->can('update', $agency), 403);

        return $this->json(['data' => $status->for($agency)]);
    }
}
