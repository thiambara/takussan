<?php

namespace App\Http\Requests\Auth;

/**
 * TCK-589 — `POST /auth/phone/verify-code` : le numéro, le code reçu, et le second
 * facteur quand le compte en porte un (même champs que `/auth/login`).
 */
class VerifyPhoneLoginCodeRequest extends RequestPhoneLoginCodeRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return parent::rules() + [
            'code' => ['required', 'string', 'max:12'],
            'two_factor_code' => ['sometimes', 'nullable', 'string', 'size:6'],
            'recovery_code' => ['sometimes', 'nullable', 'string'],
            'device_name' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
