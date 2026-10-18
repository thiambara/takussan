<?php

namespace App\Http\Requests;

use App\Models\Property;
use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-074 — body schema for `POST /api/properties/bulk-archive`.
 */
class PropertyBulkArchiveRequest extends FormRequest
{
    /** TCK-817 (P22.02) — la capacité de l'action unitaire à l'agence active, avant toute validation. */
    public function authorize(): bool
    {
        return $this->user()?->can('bulkUpdate', Property::class) === true;
    }

    public function rules(): array
    {
        return [
            'property_ids' => ['required', 'array', 'min:1', 'max:200'],
            'property_ids.*' => ['integer', 'distinct'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
