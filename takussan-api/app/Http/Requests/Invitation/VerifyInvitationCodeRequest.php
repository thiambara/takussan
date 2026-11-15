<?php

namespace App\Http\Requests\Invitation;

/**
 * TCK-2610 (ADR-0094 § 5) — `POST /api/public/invitations/{token}/verify` : le code reçu, le prénom et le nom (écrits
 * seulement sur un compte qui n'en a pas, TCK-2281), et les champs de `auth/phone/verify-code` — second facteur, nom de
 * l'appareil, version des conditions quand un compte du Radar doit les accepter (TCK-2404). `phone` comme à l'envoi :
 * requis pour une invitation par e-mail, ignoré par SMS.
 */
class VerifyInvitationCodeRequest extends SendInvitationCodeRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return parent::rules() + [
            'code' => ['required', 'string', 'max:12'],
            'first_name' => ['nullable', 'string', 'max:120'],
            'last_name' => ['nullable', 'string', 'max:120'],
            'two_factor_code' => ['sometimes', 'nullable', 'string', 'size:6'],
            'recovery_code' => ['sometimes', 'nullable', 'string'],
            'device_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'terms_version' => ['sometimes', 'nullable', 'string', 'max:20'],
        ];
    }
}
