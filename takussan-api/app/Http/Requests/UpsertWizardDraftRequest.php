<?php

namespace App\Http\Requests;

/**
 * TCK-250 — Validates the body for `PUT /api/me/wizard-drafts/{key}`.
 *
 * `step` is a non-negative small int; `data` is an opaque JSON bag (per
 * the contract — see `WizardDraft` and TCK-250 strict business
 * constraints — no sensitive payload allowed at consumer level).
 */
class UpsertWizardDraftRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'step' => ['required', 'integer', 'min:0', 'max:65535'],
            'data' => ['nullable', 'array'],
        ];
    }
}
