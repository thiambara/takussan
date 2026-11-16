<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\ThresholdAlert;
use App\Policies\AgencyIndicatorPolicy;
use Illuminate\Validation\Rule;

/**
 * TCK-2866 — `GET /api/threshold-alerts/recipient-candidates?metric=…` : qui une alerte sur cette
 * mesure peut prévenir, avant qu'elle existe (le formulaire « Qui est prévenu »). La garde est celle
 * de la création ({@see AgencyIndicatorPolicy::create()}), sur l'agence du profil actif, et passe
 * AVANT la règle de `metric`.
 */
class ThresholdAlertCandidatesRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        return $user->can('create', [ThresholdAlert::class, $this->agency()]);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'metric' => ['required', 'string', Rule::in(ThresholdAlert::allowedMetrics())],
        ];
    }

    /** L'agence du profil actif, celle où `store` créerait l'alerte. */
    public function agency(): ?Agency
    {
        $agencyId = $this->user()?->agency_id;

        return $agencyId !== null ? Agency::query()->find($agencyId) : null;
    }
}
