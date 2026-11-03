<?php

namespace App\Http\Requests\Auth;

/**
 * TCK-589 — `POST /auth/phone/verify-code` : le numéro, le code reçu, et le second
 * facteur quand le compte en porte un (même champs que `/auth/login`), et la version des
 * conditions quand le compte du Radar doit les accepter (TCK-2404).
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
            // TCK-2404 — la version des conditions acceptées, quand la réponse `requires_terms` les a présentées.
            'terms_version' => ['sometimes', 'nullable', 'string', 'max:20'],
        ];
    }
}
