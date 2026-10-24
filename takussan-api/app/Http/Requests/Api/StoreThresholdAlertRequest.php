<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\ThresholdAlert;
use App\Policies\AgencyIndicatorPolicy;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de ThresholdAlertController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreThresholdAlertRequest extends BaseFormRequest
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
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        // L'agence que `store` résoudra par défaut : celle du profil actif.
        $agency = $user->agency_id !== null ? Agency::query()->find($user->agency_id) : null;

        return $user->can('create', [ThresholdAlert::class, $agency]);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'agency_id' => ['sometimes', 'integer', Rule::exists('agencies', 'id')->withoutTrashed()],
            'metric' => ['required', Rule::in(ThresholdAlert::allowedMetrics())],
            'operator' => ['required', Rule::in(ThresholdAlert::allowedOperators())],
            'threshold' => ['required', 'numeric'],
            'severity' => ['sometimes', Rule::in(ThresholdAlert::allowedSeverities())],
            'is_enabled' => ['sometimes', 'boolean'],
            'cooldown_hours' => ['sometimes', 'integer', 'min:1', 'max:720'],
        ];
    }
}
