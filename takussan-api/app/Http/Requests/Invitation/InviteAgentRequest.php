<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use App\Rules\TelephoneJoignable;
use App\Services\Invitation\AgentInvitationService;
use App\Support\TelephoneSaisi;
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

    /**
     * P125.04 (TCK-1283) — le numéro se tape comme le message d'erreur le montre
     * (« +221 77 123 45 67 ») ou au format national : il est ramené à l'E.164 avant que
     * `TelephoneJoignable` le juge, comme la visite et la demande de contact (TCK-590).
     */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        if ($this->has('phone')) {
            $this->merge(['phone' => TelephoneSaisi::normaliser($this->input('phone'))]);
        }
    }

    public function rules(): array
    {
        return [
            // TCK-589 — drapeau `auth.phone_login.enabled` allumé, le numéro suffit
            // (lien par SMS) ; éteint, l'e-mail reste exigé.
            'email' => $this->phoneLoginEnabled()
                ? ['nullable', 'required_without:phone', 'email:rfc']
                : ['required', 'email:rfc'],
            'role' => ['required', 'string', Rule::in(AgentInvitationService::ALLOWED_ROLES)],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            // TCK-589 — un numéro qu'aucun SMS ne joint n'est plus stocké, drapeau
            // éteint comme allumé.
            'phone' => $this->phoneLoginEnabled()
                ? ['nullable', 'required_without:email', 'string', 'max:30', new TelephoneJoignable]
                : ['nullable', 'string', 'max:30', new TelephoneJoignable],
        ];
    }

    private function phoneLoginEnabled(): bool
    {
        return (bool) config('auth.phone_login.enabled');
    }
}
