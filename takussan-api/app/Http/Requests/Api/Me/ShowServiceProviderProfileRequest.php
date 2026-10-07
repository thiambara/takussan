<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\AuthorizesTransitionally;

/**
 * TCK-592 (P16) — lire ses propres réglages de prestataire (section du profil). La même porte que
 * les deux écritures voisines : le titulaire du profil.
 */
class ShowServiceProviderProfileRequest extends BaseFormRequest
{
    use AuthorizesTransitionally;

    public function authorize(): bool
    {
        return $this->ownsProfile($this->route('sp_profile'));
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
