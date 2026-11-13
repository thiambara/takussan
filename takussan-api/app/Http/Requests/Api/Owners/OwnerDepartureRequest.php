<?php

namespace App\Http\Requests\Api\Owners;

use App\Http\Requests\BaseFormRequest;
use App\Models\Profiles\OwnerProfile;
use App\Policies\OwnerProfilePolicy;

/**
 * TCK-2753 (ADR-0108 § 7) — `GET /api/owners/{ownerProfile}/departure` et
 * `DELETE /api/owners/{ownerProfile}`, dans l'ordre de la fiche ({@see ShowOwnerProfileRequest}) : un
 * profil d'une autre agence → 404 (un identifiant étranger ne se distingue pas d'un inexistant,
 * b54b127a6) ; puis `OwnerProfilePolicy::depart` → 403. Aucun corps à valider.
 */
class OwnerDepartureRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $profile = $this->profile();
        abort_unless($user !== null && OwnerProfilePolicy::isInActorAgency($user, $profile), 404);

        return $user->can('depart', $profile);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }

    public function profile(): OwnerProfile
    {
        /** @var OwnerProfile $profile */
        $profile = $this->route('ownerProfile');

        return $profile;
    }
}
