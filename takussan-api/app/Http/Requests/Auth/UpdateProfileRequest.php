<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'bio' => ['nullable', 'string', 'max:1000'],
            'avatar' => ['nullable', 'image', 'max:2048'],
            'avatar_remove' => ['sometimes', 'boolean'],
            // E.164 strict — leading "+", country code [1-9], 6-14 more digits.
            // Empty string is allowed and treated as "clear" in the controller.
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^(?:\+[1-9]\d{6,14})?$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => 'Le numéro doit être au format international E.164 (ex : +221770000000).',
        ];
    }
}
