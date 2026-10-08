<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Payout;

/**
 * TCK-594 (ADR-0039 §3) — `GET /api/payouts/preparation` : lire le calcul d'un reversement, sans
 * rien écrire. Même autorisation que créer : `PayoutPolicy::create()`.
 */
class PreparePayoutRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Payout::class) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'landlord_id' => ['required', 'integer', 'exists:users,id'],
            'agency_id' => ['nullable', 'integer', 'exists:agencies,id'],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
        ];
    }
}
