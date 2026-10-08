<?php

namespace App\Http\Requests;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
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
            // TCK-594 (ADR-0039 §4) — qui le modifie : `AgencyPolicy::updatePayoutThreshold`.
            'payout_approval_threshold' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999999'],
            // TCK-594 (ADR-0039 §7) — TVA par défaut des factures (un taux explicite gagne).
            'default_tax_rate' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            ...$this->legalRules(),
        ];
    }

    /**
     * TCK-594 (ADR-0039 §7) — les mentions légales d'une personne morale. Une agence `individual`
     * (l'hôte) n'en a pas : elles y sont `prohibited`. Aucun contrôle de forme du NINEA ni du RCCM
     * (dette D-68) : seulement une longueur.
     *
     * @return array<string, array<int, mixed>>
     */
    private function legalRules(): array
    {
        $agency = $this->route('agency');
        $individual = $agency instanceof Agency && $agency->kind === AgencyKind::Individual;

        $rules = [
            'legal_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'ninea' => ['sometimes', 'nullable', 'string', 'max:30'],
            'rccm' => ['sometimes', 'nullable', 'string', 'max:30'],
            'legal_address' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];

        return $individual ? array_map(static fn (): array => ['prohibited'], $rules) : $rules;
    }
}
