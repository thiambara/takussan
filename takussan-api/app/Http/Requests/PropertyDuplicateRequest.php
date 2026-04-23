<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-074 — body schema for `POST /api/properties/{property}/duplicate`.
 *
 * - `copy_media` defaults to false (opt-in; keeps payloads cheap).
 * - `copy_collaborators` defaults to false.
 * - `title_suffix` is appended to the source title to differentiate the
 *   draft; defaults to " (copie)".
 */
class PropertyDuplicateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'copy_media' => ['sometimes', 'boolean'],
            'copy_collaborators' => ['sometimes', 'boolean'],
            'title_suffix' => ['sometimes', 'nullable', 'string', 'max:50'],
        ];
    }
}
