<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use App\Rules\TelephoneJoignable;

/**
 * TCK-260 — payload validation for
 * `POST /api/agencies/{agency}/service-providers/invite`.
 *
 * Authorization is performed by the controller via the policy
 * (`ServiceProviderProfilePolicy@invite`) rather than here, so super_admin
 * can short-circuit the same way it does on every other surface.
 */
class InviteServiceProviderRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // TCK-589 — drapeau `auth.phone_login.enabled` allumé, le numéro suffit
            // (lien par SMS) ; éteint, l'e-mail reste exigé.
            'email' => $this->phoneLoginEnabled()
                ? ['nullable', 'required_without:phone', 'email:rfc']
                : ['required', 'email:rfc'],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            // TCK-589 — un numéro qu'aucun SMS ne joint n'est plus stocké, drapeau
            // éteint comme allumé.
            'phone' => $this->phoneLoginEnabled()
                ? ['nullable', 'required_without:email', 'string', 'max:30', new TelephoneJoignable]
                : ['nullable', 'string', 'max:30', new TelephoneJoignable],
            'trades' => ['nullable', 'array'],
            'trades.*' => ['string', 'max:60'],
            'intervention_zones' => ['nullable', 'array'],
            'intervention_zones.*' => ['string', 'max:120'],
            'metadata' => ['nullable', 'array'],
            'metadata.from_maintenance_request_id' => ['nullable', 'integer', 'min:1'],
        ];
    }

    private function phoneLoginEnabled(): bool
    {
        return (bool) config('auth.phone_login.enabled');
    }
}
