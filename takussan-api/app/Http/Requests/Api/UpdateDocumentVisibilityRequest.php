<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2759 (ADR-0099, amendement du 2026-11-12, § 4) — `PATCH /api/documents/{document}/visibility`
 * avec `{ is_internal: bool }`. L'autorisation délègue à `DocumentPolicy::setVisibility()`, avant la
 * validation : qui n'a pas le geste reçoit 403, jamais un 422 qui décrirait le corps attendu.
 */
class UpdateDocumentVisibilityRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $document = $this->route('document');

        return $document !== null && $this->user()?->can('setVisibility', $document) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'is_internal' => ['required', 'boolean'],
        ];
    }
}
