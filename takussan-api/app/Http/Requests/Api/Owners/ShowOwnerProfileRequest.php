<?php

namespace App\Http\Requests\Api\Owners;

use App\Http\Requests\BaseFormRequest;
use App\Models\Profiles\OwnerProfile;
use App\Policies\OwnerProfilePolicy;
use App\Services\Reporting\OverdueInstalment;
use App\Support\AgencyKindGuard;

/**
 * TCK-2640 — `GET /api/owners/{ownerProfile}?period=YYYY-MM|YYYY` : la fiche d'un bailleur du carnet.
 *
 * Dans cet ordre, avant la validation : un profil d'une autre agence → 404
 * ({@see OwnerProfilePolicy::isInActorAgency()}) ; puis la fiche → 403 sans `viewDetail` ; puis
 * une agence `individual`, qui n'a pas de carnet (features §1.12) → 403 `agency.standard_only`, comme
 * la liste.
 */
class ShowOwnerProfileRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $profile = $this->profile();
        abort_unless($user !== null && OwnerProfilePolicy::isInActorAgency($user, $profile), 404);
        if (! $user->can('viewDetail', $profile)) {
            return false;
        }
        AgencyKindGuard::ensureStandardForNonGlobal($user, (int) $profile->agency_id);

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'period' => ['sometimes', 'string', 'regex:/^\d{4}(-(0[1-9]|1[0-2]))?$/'],
        ];
    }

    public function profile(): OwnerProfile
    {
        /** @var OwnerProfile $profile */
        $profile = $this->route('ownerProfile');

        return $profile;
    }

    /** La période des chiffres : celle demandée, sinon le mois courant à Dakar. */
    public function period(): string
    {
        return $this->filled('period') ? $this->string('period')->toString() : now(OverdueInstalment::TIMEZONE)->format('Y-m');
    }
}
