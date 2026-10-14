<?php

namespace App\Http\Requests\Auth;

/** TCK-633 (lot C) — le code reçu sur le second numéro, et sa case WhatsApp. */
class VerifySecondaryPhoneRequest extends SecondaryPhoneRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return parent::rules() + [
            'code' => ['required', 'string', 'digits:6'],
            'whatsapp' => ['sometimes', 'boolean'],
        ];
    }
}
