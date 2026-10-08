<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-596 §3B (ADR-0041) — bloquer une plage `[starts_on, ends_on)` d'un bien. `ends_on` est le
 * lendemain de la dernière nuit bloquée, comme le jour de départ d'une réservation.
 */
class StorePropertyUnavailabilityRequest extends BaseFormRequest
{
    /** Délégation : qui peut modifier le bien peut bloquer ses dates (`PropertyPolicy::update`). */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required', 'date_format:Y-m-d', 'after:starts_on', 'before_or_equal:'.now()->addMonths(24)->toDateString()],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}
