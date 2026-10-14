<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Rules\TelephoneJoignable;

/**
 * TCK-633 (lot C) — la liste COMPLÈTE des contacts sur place (remplacement). Autorisation calquée
 * sur la mise à jour du bien (`PropertyPolicy::update`), jugée avant la validation (TCK-305).
 */
class ReplacePropertyContactsRequest extends BaseFormRequest
{
    public const MAX_CONTACTS = 3;

    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'contacts' => ['present', 'array', 'max:'.self::MAX_CONTACTS],
            'contacts.*.label' => ['nullable', 'string', 'max:60'],
            'contacts.*.phone' => ['required', 'string', 'max:30', 'regex:/^\+[1-9]\d{6,14}$/', new TelephoneJoignable],
            'contacts.*.has_whatsapp' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return ['contacts.*.phone.regex' => __('validation.rules.phone_e164')];
    }
}
