<?php

namespace App\Http\Requests\Auth;

use App\Rules\TelephoneJoignable;
use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-589 — `POST /auth/phone/request-code`. Drapeau `auth.phone_login.enabled`
 * éteint : 404, avant toute validation (la route n'existe pas pour le client).
 */
class RequestPhoneLoginCodeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        abort_unless((bool) config('auth.phone_login.enabled'), 404);

        if (is_string($this->input('phone'))) {
            $this->merge(['phone' => preg_replace('/\s+/', '', $this->input('phone'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'phone' => ['required', 'string', 'max:30', new TelephoneJoignable],
        ];
    }
}
