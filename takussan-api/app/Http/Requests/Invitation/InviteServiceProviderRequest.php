<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;

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
            'email' => ['required', 'email:rfc'],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:30'],
            'trades' => ['nullable', 'array'],
            'trades.*' => ['string', 'max:60'],
            'intervention_zones' => ['nullable', 'array'],
            'intervention_zones.*' => ['string', 'max:120'],
            'metadata' => ['nullable', 'array'],
            'metadata.from_maintenance_request_id' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
