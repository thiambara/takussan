<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-600 — `POST /api/admin/agencies/{agency}/suspend` : suspendre une agence : elle quitte le site et ne s'écrit plus (ADR-0048).
 * Motif obligatoire : il figure dans l'activité et dans l'avis aux admins de l'agence.
 */
class SuspendAgencyRequest extends BaseFormRequest
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
