<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\Concerns\ConvertitLesInstantsRecus;
use App\Models\Agency;
use App\Models\RoleDelegation;
use App\Rules\InstantIso;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-591 (ADR-0035) — déclarer l'absence d'un membre du personnel (`user_id`) et son remplaçant
 * (`substitute_id`). L'autorisation précède la validation : un tiers reçoit 403, pas la liste des
 * champs manquants.
 *
 * TCK-2666 (ADR-0035, amendement du 2026-11-10) — `substitute_can_act` demande en plus une
 * délégation liée : il faut alors pouvoir déléguer (`create` de la page Rôles), sinon 403 avant
 * toute écriture.
 */
class StoreAgentAbsenceRequest extends FormRequest
{
    use ConvertitLesInstantsRecus;

    public function authorize(): bool
    {
        /** @var Agency $agency */
        $agency = $this->route('agency');

        return $this->user()->can('declareAbsence', [RoleDelegation::class, $agency, (int) $this->input('user_id')])
            && (! $this->boolean('substitute_can_act') || $this->user()->can('create', [RoleDelegation::class, $agency]));
    }

    public function rules(): array
    {
        $maxEndDate = now()->addDays((int) config('role_delegations.max_duration_days', 366))->toIso8601String();

        return [
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->withoutTrashed()],
            'substitute_id' => ['required', 'integer', Rule::exists('users', 'id')->withoutTrashed(), 'different:user_id'],
            'starts_at' => ['nullable', 'date', new InstantIso],
            'ends_at' => ['required', 'date', new InstantIso, 'after:now', 'after:starts_at', "before_or_equal:$maxEndDate"],
            'reason' => ['nullable', 'string', 'max:500'],
            'substitute_can_act' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * TCK-2743 — {@see ConvertitLesInstantsRecus}.
     * `ends_at` n'est pas ici : il passe par `FinInclusive::de()`.
     */
    protected function instantsRecus(): array
    {
        return ['starts_at'];
    }
}
