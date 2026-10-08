<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-600 — `POST /api/admin/agencies/{agency}/reinstate` : lever la suspension : l'agence revient à `active`, sa vérification intacte.
 * Motif obligatoire : il figure dans l'activité et dans l'avis aux admins de l'agence.
 */
class ReinstateAgencyRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::AgenciesSuspend) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
