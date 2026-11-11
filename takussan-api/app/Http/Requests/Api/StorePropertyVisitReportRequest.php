<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\VisitFollowUp;
use App\Models\Enums\VisitObjection;
use App\Models\Enums\VisitReportOutcome;
use Illuminate\Validation\Rule;

/**
 * TCK-2578 (ADR-0101) — le compte rendu de visite, en `POST` (création) et en `PATCH`
 * (« Modifier » : les champs absents gardent leur valeur).
 *
 * L'autorisation court ICI, avant la validation : un appelant sans droit sur la visite reçoit 403,
 * jamais la liste fermée des verdicts et des objections. Simple délégation à
 * `PropertyVisitPolicy::report`.
 */
class StorePropertyVisitReportRequest extends BaseFormRequest
{
    public const NOTE_MAX = 2000;

    public function authorize(): bool
    {
        return $this->user()?->can('report', $this->route('visit')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $partiel = $this->isMethod('PATCH');

        return [
            'outcome' => [$partiel ? 'sometimes' : 'required', 'required', Rule::enum(VisitReportOutcome::class)],
            'objections' => ['sometimes', 'nullable', 'array', 'max:'.count(VisitObjection::cases())],
            'objections.*' => ['distinct', Rule::enum(VisitObjection::class)],
            'note' => ['sometimes', 'nullable', 'string', 'max:'.self::NOTE_MAX],
            'follow_up' => ['sometimes', 'nullable', Rule::enum(VisitFollowUp::class)],
        ];
    }
}
