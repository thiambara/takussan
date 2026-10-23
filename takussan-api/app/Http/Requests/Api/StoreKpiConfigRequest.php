<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\KpiConfig;
use App\Policies\AgencyIndicatorPolicy;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de KpiConfigController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreKpiConfigRequest extends BaseFormRequest
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

        return $user->can('create', [KpiConfig::class, $agency]);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'agency_id' => ['sometimes', 'integer', Rule::exists('agencies', 'id')->withoutTrashed()],
            // TCK-1102 (P92.03) — un indicateur au plus une fois par agence (`unique(agency_id,
            // metric)`, models-spec § 64), jugé sur l'agence que `store` résoudra.
            'metric' => [
                'required',
                Rule::in(KpiConfig::allowedMetrics()),
                Rule::unique('kpi_configs', 'metric')->where('agency_id', $this->agenceVisee()),
            ],
            'label' => ['required', 'string', 'max:120'],
            'format' => ['sometimes', Rule::in(['number', 'percent', 'currency'])],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:999'],
            'is_enabled' => ['sometimes', 'boolean'],
        ];
    }

    /** L'agence que `KpiConfigController::store` résout : celle désignée, sinon celle de l'appelant. */
    private function agenceVisee(): ?int
    {
        $agencyId = $this->input('agency_id') ?? $this->user()?->agency_id;

        return is_numeric($agencyId) ? (int) $agencyId : null;
    }
}
