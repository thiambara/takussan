<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBusinessEnumValueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'labels' => ['sometimes', 'array'],
            'labels.fr' => ['sometimes', 'required', 'string', 'max:120'],
            'labels.en' => ['nullable', 'string', 'max:120'],
            'labels.wo' => ['nullable', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
