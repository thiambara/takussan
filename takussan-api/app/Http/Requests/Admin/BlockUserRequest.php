<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-600 — console plateforme : bloquer un compte : ses jetons tombent, il ne s'authentifie plus.
 * Motif obligatoire : il figure dans l'activité et dans l'avis à l'utilisateur.
 */
class BlockUserRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::UsersBlock) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
