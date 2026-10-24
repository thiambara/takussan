<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\ThresholdAlert;
use App\Policies\AgencyIndicatorPolicy;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de ThresholdAlertController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateThresholdAlertRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * TCK-1701 (P82.04) — DÉLÉGATION à {@see AgencyIndicatorPolicy} : `agency.update` sous le
     * profil actif de l'agence, plus `isAgencyAdminAt` (un admin sans la capacité passait, un
     * agent qui la tenait était refusé).
     */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('threshold_alert')) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'metric' => ['sometimes', Rule::in(ThresholdAlert::allowedMetrics())],
            'operator' => ['sometimes', Rule::in(ThresholdAlert::allowedOperators())],
            'threshold' => ['sometimes', 'numeric'],
            'severity' => ['sometimes', Rule::in(ThresholdAlert::allowedSeverities())],
            'is_enabled' => ['sometimes', 'boolean'],
            'cooldown_hours' => ['sometimes', 'integer', 'min:1', 'max:720'],
        ];
    }
}
