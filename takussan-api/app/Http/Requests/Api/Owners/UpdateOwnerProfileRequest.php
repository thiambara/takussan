<?php

namespace App\Http\Requests\Api\Owners;

use App\Http\Requests\BaseFormRequest;
use App\Models\Profiles\OwnerProfile;
use App\Policies\OwnerProfilePolicy;
use App\Support\AgencyKindGuard;

/**
 * TCK-2640 — `PATCH /api/owners/{ownerProfile}` : le plafond de travaux du bailleur (ADR-0037).
 *
 * Même ordre que la fiche ({@see ShowOwnerProfileRequest}) : 404 hors de l'agence, puis 403 sans
 * `owners.update`, puis 403 pour une agence `individual`, et seulement alors 422 — un appelant sans
 * droit n'apprend rien du contrat.
 *
 * La clé est EXIGÉE (`present`) : un corps vide ne vaut pas « retirer le plafond ». `null` le
 * retire explicitement (« aucun accord exigé », la sémantique d'`OwnerApprovalThreshold::of()`) ;
 * `0` exige l'accord du bailleur pour tout devis non nul (le plafond est dépassé strictement).
 */
class UpdateOwnerProfileRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $profile = $this->profile();
        abort_unless($user !== null && OwnerProfilePolicy::isInActorAgency($user, $profile), 404);
        if (! $user->can('update', $profile)) {
            return false;
        }
        AgencyKindGuard::ensureStandardForNonGlobal($user, (int) $profile->agency_id);

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // decimal(14,2) : au plus 12 chiffres avant la virgule.
            'works_approval_threshold' => ['present', 'nullable', 'numeric', 'min:0', 'max:999999999999.99'],
        ];
    }

    public function profile(): OwnerProfile
    {
        /** @var OwnerProfile $profile */
        $profile = $this->route('ownerProfile');

        return $profile;
    }
}
