<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\RadarDiscardReason;
use Illuminate\Validation\Rule;

/** TCK-2387 — écarter une annonce : un motif de la liste fermée {@see RadarDiscardReason} (décision 11a). */
class DiscardRadarListingRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route, comme la saisie. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['reason' => ['required', Rule::enum(RadarDiscardReason::class)]];
    }

    public function reason(): RadarDiscardReason
    {
        return RadarDiscardReason::from((string) $this->validated('reason'));
    }
}
