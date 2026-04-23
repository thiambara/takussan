<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-074 — body schema for `POST /api/properties/bulk-archive`.
 */
class PropertyBulkArchiveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'property_ids' => ['required', 'array', 'min:1', 'max:200'],
            'property_ids.*' => ['integer', 'distinct', 'exists:properties,id'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
