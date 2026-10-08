<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-600 (ADR-0047 §5) — `POST /api/admin/super-admins/{user}/revoke` : retirer un opérateur
 * plateforme actif. Motif obligatoire (journalisé, transmis aux pairs).
 */
class RevokePlatformOperatorRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::OperatorsManage) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
