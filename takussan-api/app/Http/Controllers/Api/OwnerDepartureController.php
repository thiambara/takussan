<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Owners\OwnerDepartureRequest;
use App\Models\Profiles\OwnerProfile;
use App\Services\Owners\OwnerDeparture;
use App\Services\Owners\OwnerDepartureService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2753 (ADR-0108) — le départ d'un bailleur de l'agence : la lecture de ce qui le bloque encore,
 * puis le geste. L'administrateur actif de l'agence du profil seul, ou le super-admin
 * (`OwnerProfilePolicy::depart`) ; le geste sous double authentification
 * (`ProtectedActions::AGENCY_TWO_FACTOR`, ce contrôleur dans `FAMILY_CONTROLLERS`).
 */
class OwnerDepartureController extends Controller
{
    public function __construct(
        private readonly OwnerDeparture $inventaire,
        private readonly OwnerDepartureService $departs,
    ) {}

    /**
     * `GET /api/owners/{ownerProfile}/departure` — le même inventaire que la garde du geste et le corps
     * de son refus. `can_depart` dit aussi les refus de forme : un brouillon ou un profil déjà parti ne
     * part pas, même vide (leur inventaire n'est alors pas compté).
     */
    public function show(OwnerDepartureRequest $request, OwnerProfile $ownerProfile): JsonResponse
    {
        $profile = $ownerProfile;
        if ($profile->user_id === null) {
            return $this->json(['data' => [
                'blocking' => array_fill_keys(OwnerDeparture::CLES, 0),
                'balance' => null,
                'can_depart' => false,
            ]]);
        }

        $inventaire = $this->inventaire->inventory($profile);

        return $this->json(['data' => [
            'blocking' => $inventaire['blocking'],
            'balance' => $inventaire['balance'],
            'can_depart' => OwnerDeparture::estVide($inventaire['blocking']) && $this->departs->peutPartir($profile, $request->user()),
        ]]);
    }

    /** `DELETE /api/owners/{ownerProfile}` — le profil, `inactive`, avec la date de son départ. */
    public function destroy(OwnerDepartureRequest $request, OwnerProfile $ownerProfile): JsonResponse
    {
        $profile = $this->departs->depart($ownerProfile, $request->user());

        return $this->json(['data' => [
            'id' => $profile->id,
            'user_id' => $profile->user_id,
            'agency_id' => $profile->agency_id,
            'status' => $profile->status->value,
            'departed_at' => $this->instant(OwnerDepartureService::departedAt($profile)),
        ]]);
    }
}
