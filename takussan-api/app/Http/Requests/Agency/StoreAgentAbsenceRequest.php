<?php

namespace App\Http\Requests\Agency;

use App\Models\Agency;
use App\Models\RoleDelegation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-591 (ADR-0035) — déclarer l'absence d'un membre du personnel (`user_id`) et son remplaçant
 * (`substitute_id`). L'autorisation précède la validation : un tiers reçoit 403, pas la liste des
 * champs manquants.
 */
class StoreAgentAbsenceRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var Agency $agency */
        $agency = $this->route('agency');

        return $this->user()->can('declareAbsence', [RoleDelegation::class, $agency, (int) $this->input('user_id')]);
    }

    public function rules(): array
    {
        $maxEndDate = now()->addDays((int) config('role_delegations.max_duration_days', 366))->toIso8601String();

        return [
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'substitute_id' => ['required', 'integer', Rule::exists('users', 'id'), 'different:user_id'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['required', 'date', 'after:now', 'after:starts_at', "before_or_equal:$maxEndDate"],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
