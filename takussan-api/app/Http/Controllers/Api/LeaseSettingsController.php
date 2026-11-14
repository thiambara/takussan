<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Services\Lease\ReglagesDeBailDeLAgence;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2832 — `GET /api/settings/lease` : les réglages de bail de l'agence de l'appelant, que l'écran
 * `/app/agency/lease-settings` montre et fait changer. Lecture seule ; l'écriture passe par
 * `POST /api/settings` (portée `agency`) et le retour à la plateforme par `DELETE /api/settings/{id}`.
 *
 * À qui configure l'agence (`AgencyPolicy::configure`), comme la liste `GET /api/settings` : ni un
 * agent, ni un bailleur, ni l'admin d'une autre agence.
 */
class LeaseSettingsController extends Controller
{
    public function __invoke(Request $request, ReglagesDeBailDeLAgence $reglages): JsonResponse
    {
        $agencyId = $request->user()->agency_id;
        abort_if($agencyId === null, 403);
        $this->authorize('configure', Agency::query()->findOrFail($agencyId));

        return $this->json(['data' => [
            'can_edit' => true,
            'settings' => $reglages->pour((int) $agencyId),
        ]]);
    }
}
