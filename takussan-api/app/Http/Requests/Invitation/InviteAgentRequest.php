<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use App\Services\Invitation\AgentInvitationService;
use Illuminate\Validation\Rule;

/**
 * TCK-258 — payload validation for `POST /api/agencies/{agency}/agents/invite`.
 *
 * Authorization is performed by the controller via the policy
 * (`AgentProfilePolicy@invite`) rather than here, so super_admin can
 * short-circuit the same way it does on every other surface.
 */
class InviteAgentRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email:rfc'],
            'role' => ['required', 'string', Rule::in(AgentInvitationService::ALLOWED_ROLES)],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:30'],
        ];
    }
}
