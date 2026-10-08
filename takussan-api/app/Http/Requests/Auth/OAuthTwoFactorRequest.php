<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-589, vérification adverse B2 — `POST /auth/oauth/2fa` : le défi rendu par le rappel
 * OAuth d'un compte à 2FA, et le second facteur (mêmes champs que `/auth/login`).
 */
class OAuthTwoFactorRequest extends BaseFormRequest
{
    /** Public : le défi EST la preuve d'identité, le contrôleur le juge. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'challenge' => ['required', 'string', 'max:128'],
            'two_factor_code' => ['nullable', 'string', 'size:6', 'required_without:recovery_code'],
            'recovery_code' => ['nullable', 'string', 'max:64', 'required_without:two_factor_code'],
            'device_name' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
