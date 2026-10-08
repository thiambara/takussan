<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\PayoutMethod;
use App\Models\User;

/**
 * TCK-594 (ADR-0039 §6) — `GET /api/payout-methods?filter[user_id]=` : les destinations MASQUÉES
 * d'un titulaire, pour l'agence qui le paie (`PayoutMethodPolicy::viewHolder`).
 */
class ListPayoutMethodsRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $holder = User::query()->find($this->input('filter.user_id'));

        return $holder !== null && $this->user()?->can('viewHolder', [PayoutMethod::class, $holder]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter.user_id' => ['required', 'integer'],
        ];
    }
}
