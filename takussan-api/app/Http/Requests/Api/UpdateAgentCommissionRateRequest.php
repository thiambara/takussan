<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Policies\AgentProfilePolicy;

/**
 * TCK-2364 (P241.02 ; ADR-0049 « Ventilation » § 2, amendement du 2026-10-25) —
 * `PATCH /api/profiles/{agent_profile}/commission-rate` : le taux de commission d'un agent, en
 * pourcentage, que le grand livre lui verse quand il négocie un bail. `null` l'efface (taux nul).
 *
 * L'autorisation court ici, avant la validation, et délègue à
 * {@see AgentProfilePolicy::setCommissionRate()}.
 */
class UpdateAgentCommissionRateRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('setCommissionRate', $this->route('agent_profile')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'commission_rate' => ['present', 'nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }
}
