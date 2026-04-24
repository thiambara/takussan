<?php

namespace App\Http\Requests;

use App\Models\Enums\Currency;
use Illuminate\Validation\Rule;

/**
 * TCK-084 — typed validator for the `PATCH /api/agencies/{id}` payload.
 *
 * Authorisation lives in {@see AgencyController::update()} — the form request
 * only validates shape. Adding the rules here lets us exercise the multi-
 * currency contract under unit tests without spinning the full HTTP stack.
 */
class AgencyUpdateRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string'],
            'license_number' => ['sometimes', 'nullable', 'string'],
            'description' => ['sometimes', 'nullable', 'string'],
            'email' => ['sometimes', 'nullable', 'email'],
            'phone' => ['sometimes', 'nullable', 'string'],
            'website' => ['sometimes', 'nullable', 'url'],
            'commission_rate' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'currency' => ['sometimes', Rule::enum(Currency::class)],
            'settings' => ['sometimes', 'nullable', 'array'],
        ];
    }
}
