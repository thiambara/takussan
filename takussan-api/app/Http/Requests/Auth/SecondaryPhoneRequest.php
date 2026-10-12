<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;
use App\Rules\TelephoneJoignable;

/** TCK-633 (lot C) — le numéro d'un envoi de code au second numéro. */
class SecondaryPhoneRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'phone' => ['required', 'string', 'max:30', 'regex:/^\+[1-9]\d{6,14}$/', new TelephoneJoignable],
        ];
    }

    public function messages(): array
    {
        return ['phone.regex' => __('validation.rules.phone_e164')];
    }
}
