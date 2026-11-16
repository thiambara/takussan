<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;

/**
 * TCK-2923 — `GET /api/agencies/{agency}/properties/most-viewed?limit=6` : à qui peut écrire la vitrine
 * de l'agence, la règle de `AgencyUpdateRequest` (`AgencyPolicy::configure`, jumelle de
 * `peutEcrireLaVitrine` côté front), jugée AVANT la validation (403 avant 422).
 */
class AgencyMostViewedPropertiesRequest extends BaseFormRequest
{
    public const LIMIT_DEFAULT = 6;

    public const LIMIT_MAX = 12;

    public function authorize(): bool
    {
        $agency = $this->route('agency');

        return $agency instanceof Agency && $this->user()?->can('configure', $agency) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'limit' => ['sometimes', 'integer', 'min:1', 'max:'.self::LIMIT_MAX],
        ];
    }
}
