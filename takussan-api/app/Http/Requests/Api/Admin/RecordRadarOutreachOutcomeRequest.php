<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\RadarOutreachOutcome;
use Illuminate\Validation\Rule;

/**
 * TCK-2388 (ADR-0077 §3) — l'issue d'un message d'accord : `consented`, `refused`, `stop`, `question` ou `no_answer`,
 * avec un motif écrit facultatif. Le motif devient obligatoire quand on confirme un accord contre un verdict de l'IA
 * qui n'y va pas : c'est `RadarConsentWorkflow::recordOutcome()` qui le juge, sur le verdict ENREGISTRÉ.
 */
class RecordRadarOutreachOutcomeRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'outcome' => ['required', Rule::enum(RadarOutreachOutcome::class)],
            'reason' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function outcome(): RadarOutreachOutcome
    {
        return RadarOutreachOutcome::from((string) $this->validated('outcome'));
    }

    public function reason(): ?string
    {
        $reason = $this->validated('reason');

        return is_string($reason) ? $reason : null;
    }
}
