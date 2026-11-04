<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\NormalizesRadarTargetCriteria;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\RadarTargetStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-2468 (ADR-0087 §5) — créer une cible de l'opérateur : `{name, criteria, status?}`. `status` : `active` (défaut) ou
 * `paused`. L'origine est toujours `operator` : une cible `demand` ne se crée pas ici (TCK-2470), et `origin` est refusé.
 * Les critères sont jugés par `RadarTargetCriteria` (422 `radar.targets.*`). `platform.radar.publish` : la route le garde,
 * `authorize()` le redit avant toute validation.
 */
class StoreRadarTargetRequest extends BaseFormRequest
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
            'name' => ['required', 'string', 'max:120'],
            // `present` et non `required` : `{}` atteint le juge des critères, qui le refuse en `radar.targets.empty_criteria`.
            'criteria' => ['present', 'array'],
            'status' => ['sometimes', 'required', Rule::in([RadarTargetStatus::Active->value, RadarTargetStatus::Paused->value])],
            'origin' => ['prohibited'],
        ];
    }

    public function status(): RadarTargetStatus
    {
        return RadarTargetStatus::from((string) ($this->validated('status') ?? RadarTargetStatus::Active->value));
    }
}
