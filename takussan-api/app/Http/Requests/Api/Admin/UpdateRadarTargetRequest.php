<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\NormalizesRadarTargetCriteria;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\RadarTargetStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-2468 (ADR-0087 §5) — modifier une cible : `{name?, criteria?, status?, pinned?}`, seuls les champs envoyés.
 * `status` : `active` ou `paused` (retirer passe par `DELETE`) ; réactiver une cible retirée la soumet au plafond et au
 * doublon comme une création. Modifier les critères d'une cible `demand` l'épingle (`RadarTargets::update()`).
 */
class UpdateRadarTargetRequest extends BaseFormRequest
{
    use NormalizesRadarTargetCriteria;

    public function authorize(): bool
    {
        return $this->user()?->hasPlatformAbility(PlatformAbility::RadarPublish) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'criteria' => ['sometimes', 'present', 'array'],
            'status' => ['sometimes', 'required', Rule::in([RadarTargetStatus::Active->value, RadarTargetStatus::Paused->value])],
            'pinned' => ['sometimes', 'required', 'boolean'],
        ];
    }

    /** @return array{name?: string, criteria?: array<string, mixed>, status?: RadarTargetStatus, pinned?: bool} */
    public function changes(): array
    {
        $changes = [];
        if ($this->has('name')) {
            $changes['name'] = (string) $this->validated('name');
        }
        if ($this->criteria() !== null) {
            $changes['criteria'] = $this->criteria();
        }
        if ($this->has('status')) {
            $changes['status'] = RadarTargetStatus::from((string) $this->validated('status'));
        }
        if ($this->has('pinned')) {
            $changes['pinned'] = $this->boolean('pinned');
        }

        return $changes;
    }
}
