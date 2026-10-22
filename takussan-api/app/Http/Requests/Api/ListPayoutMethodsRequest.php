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
        // TCK-1403 (P151.05) — `authorize()` passe avant la règle `integer` : un identifiant
        // illisible est un titulaire introuvable (403), plus une erreur PostgreSQL (500).
        $userId = $this->input('filter.user_id');
        $holder = is_int($userId) || (is_string($userId) && ctype_digit($userId) && strlen($userId) <= 18)
            ? User::query()->find($userId)
            : null;

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
