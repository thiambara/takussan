<?php

namespace App\Http\Requests;

use App\Models\Enums\Currency;
use App\Models\Enums\WatermarkPosition;
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
            'moderation_required' => ['sometimes', 'boolean'], // TCK-597 — l'agence choisit de modérer ses annonces.
            // TCK-593 — plus `nullable` : `settings` se FUSIONNE clé par clé dans
            // `AgencyController::update`, et un `null` au premier niveau ne dit pas quelle clé
            // retirer. Une clé à `null`, elle, revient au défaut du code.
            'settings' => ['sometimes', 'array'],
            'settings.watermark_enabled' => ['sometimes', 'boolean'],
            'settings.watermark_position' => ['sometimes', Rule::enum(WatermarkPosition::class)],
            'settings.watermark_opacity' => ['sometimes', 'integer', 'between:10,100'],
            // TCK-589 — 2FA exigée de tout le personnel de l'agence (contrainte 7).
            'settings.require_team_two_factor' => ['sometimes', 'boolean'],
            // TCK-593 — absent = `false` (`Agency::collectsLateFeesOnline()`).
            'settings.late_fee_online_collection' => ['sometimes', 'nullable', 'boolean'],
        ];
    }
}
