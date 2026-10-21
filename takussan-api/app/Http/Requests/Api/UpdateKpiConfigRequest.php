<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\KpiConfig;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de KpiConfigController::update(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UpdateKpiConfigRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * ⚠ **REPRISE, pas délégation** : cette règle n'est pas encore dans une policy — elle fait
     * partie des 19 helpers relevés hors périmètre de TCK-306. L'expression est reproduite à
     * l'identique ; son domicile définitif est une policy, et le ticket de suite doit la
     * convertir en délégation comme les 35 autres.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $kpi = $this->route('kpi_config');

        return $user !== null && ($user->isSuperAdmin()
            || ($user->agency_id !== null && $user->agency_id === $kpi->agency_id && $user->isAgencyAdminAt((int) $kpi->agency_id)));
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-1102 (P92.03) — un indicateur au plus une fois par agence (`unique(agency_id,
            // metric)`, models-spec § 64) ; l'indicateur modifié ne se compte pas lui-même.
            'metric' => [
                'sometimes',
                Rule::in(KpiConfig::allowedMetrics()),
                Rule::unique('kpi_configs', 'metric')
                    ->where('agency_id', $this->route('kpi_config')->agency_id)
                    ->ignore($this->route('kpi_config')),
            ],
            'label' => ['sometimes', 'string', 'max:120'],
            'format' => ['sometimes', Rule::in(['number', 'percent', 'currency'])],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:999'],
            'is_enabled' => ['sometimes', 'boolean'],
            'settings' => ['sometimes', 'array'],
        ];
    }
}
