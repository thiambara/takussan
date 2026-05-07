<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Foundation\Http\FormRequest;

class StoreBusinessEnumValueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'value' => ['required', 'string', 'max:80', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'labels' => ['required', 'array'],
            'labels.fr' => ['required', 'string', 'max:120'],
            'labels.en' => ['nullable', 'string', 'max:120'],
            'labels.wo' => ['nullable', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
