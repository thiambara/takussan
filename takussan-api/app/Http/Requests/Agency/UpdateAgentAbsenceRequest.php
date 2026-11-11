<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use Illuminate\Validation\Rule;

/**
 * TCK-2666 (ADR-0035, amendement du 2026-11-10) — `PATCH /api/agencies/{agency}/absences/{delegation}`.
 *
 * Ordre des refus : 404 (absence d'une autre agence, ou délégation ordinaire), puis 403
 * (`RoleDelegationPolicy::updateAbsence`), puis 422. Le droit d'agir du remplaçant est TOUCHÉ quand,
 * après la modification, une délégation liée sera en cours et que ses dates, son remplaçant ou son
 * existence sont dans la requête : il faut alors pouvoir déléguer.
 */
class UpdateAgentAbsenceRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        /** @var Agency $agency */
        $agency = $this->route('agency');
        $absence = $this->absence();
        abort_unless((int) $absence->agency_id === (int) $agency->id && $absence->isAbsence(), 404);

        return $this->user()?->can('updateAbsence', [$absence, $this->touchesGrant($absence)]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $maxEndDate = now()->addDays((int) config('role_delegations.max_duration_days', 366))->toIso8601String();

        return [
            'starts_at' => ['sometimes', 'nullable', 'date'],
            'ends_at' => ['sometimes', 'required', 'date', 'after:now', "before_or_equal:$maxEndDate"],
            'substitute_id' => ['sometimes', 'required', 'integer', Rule::exists('users', 'id')->withoutTrashed()],
            'substitute_can_act' => ['sometimes', 'boolean'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }

    public function absence(): RoleDelegation
    {
        /** @var RoleDelegation */
        return $this->route('delegation');
    }

    private function touchesGrant(RoleDelegation $absence): bool
    {
        $live = RoleDelegation::query()
            ->where('covers_absence_id', $absence->getKey())
            ->whereIn('status', [RoleDelegationStatus::Scheduled, RoleDelegationStatus::Active])
            ->exists();
        $canActAfter = $this->has('substitute_can_act') ? $this->boolean('substitute_can_act') : $live;

        return $canActAfter && $this->hasAny(['starts_at', 'ends_at', 'substitute_id', 'substitute_can_act']);
    }
}
