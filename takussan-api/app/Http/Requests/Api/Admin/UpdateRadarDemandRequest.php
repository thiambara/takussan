<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/**
 * TCK-2470 (ADR-0087 §6) — allumer ou éteindre les cibles de la demande : `{enabled}`. Celui qui l'allume en devient
 * l'opérateur (ADR-0080 §2). `super_admin` seul (`platform.radar.publish`), jugé avant la validation.
 */
class UpdateRadarDemandRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::RadarPublish) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'enabled' => ['required', 'boolean'],
        ];
    }
}
