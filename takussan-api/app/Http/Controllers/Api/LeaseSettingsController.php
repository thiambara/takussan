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
 * TCK-2920 (ADR-0111) — la LECTURE est au personnel actif de l'agence de l'espace actif (admin,
 * agent) et à qui la configure (`AgencyPolicy::viewLeaseSettings`) : ni un bailleur, ni un
 * prestataire, ni un profil non actif, ni le personnel d'une autre agence (la route ne lit que
 * l'agence de l'espace actif). L'ÉCRITURE reste à `AgencyPolicy::configure`, et `can_edit` le dit
 * pour l'appelant — calculé, jamais une constante : c'est lui que l'écran lit pour choisir l'état
 * « Lecture seule ». La liste générale `GET /api/settings` n'est pas ouverte (ADR-0111 § 4).
 */
class LeaseSettingsController extends Controller
{
    public function __invoke(Request $request, ReglagesDeBailDeLAgence $reglages): JsonResponse
    {
        $agencyId = $request->user()->agency_id;
        abort_if($agencyId === null, 403);
        $agence = Agency::query()->findOrFail($agencyId);
        $this->authorize('viewLeaseSettings', $agence);

        return $this->json(['data' => [
            'can_edit' => $request->user()->can('configure', $agence),
            'settings' => $reglages->pour((int) $agencyId),
        ]]);
    }
}
