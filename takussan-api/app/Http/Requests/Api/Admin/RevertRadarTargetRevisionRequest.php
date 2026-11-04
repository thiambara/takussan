<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformAbility;

/** TCK-2470 (ADR-0087 §6) — défaire une révision des cibles de la demande : aucun champ, `super_admin` seul. */
class RevertRadarTargetRevisionRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::RadarPublish) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
