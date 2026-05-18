<?php

namespace App\Http\Requests\Api\Me;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-253 — Partial update for the authenticated user's lightweight
 * personalisation fields. All fields are optional; only the supplied
 * keys are persisted.
 */
class UpdateMeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // Same E.164 contract as UpdateProfileRequest. Empty string is
            // accepted and treated as "clear" by the controller.
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^(?:\+[1-9]\d{6,14})?$/'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            // Free-form enum at the API layer — stored as a string. The
            // ranking pipeline (out of scope here, see TCK-253 hors-périmètre)
            // is the consumer that interprets the value.
            'search_intent' => ['sometimes', 'nullable', 'string', 'in:rent,buy,both'],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => 'Le numéro doit être au format international E.164 (ex : +221770000000).',
        ];
    }
}
