<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-600 — console plateforme : demander l'effacement d'un compte, par `AccountDeletionService` (obligations, délai de grâce).
 * Motif obligatoire : il figure dans l'activité et dans l'avis à l'utilisateur.
 */
class EraseUserRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::UsersErase) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
