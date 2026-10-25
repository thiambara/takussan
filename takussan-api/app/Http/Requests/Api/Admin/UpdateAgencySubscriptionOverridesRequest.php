<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2222 (P214.01) — les dérogations de l'abonnement ouvert, modifiées sur place. Une clé absente
 * garde la valeur en base ; une clé à `null` retire la dérogation (la valeur du plan revient).
 */
class UpdateAgencySubscriptionOverridesRequest extends BaseFormRequest
{
    /** La route est sous `super-admin` : rien n'est autorisé ici avant la validation. */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'platform_fee_pct' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'limits' => ['sometimes', 'array:max_active_listings,max_agents,max_branches'],
            'limits.max_active_listings' => ['nullable', 'integer', 'min:0'],
            'limits.max_agents' => ['nullable', 'integer', 'min:0'],
            'limits.max_branches' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
