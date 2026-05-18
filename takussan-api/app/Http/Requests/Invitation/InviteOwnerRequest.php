<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-256 — payload validation for `POST /api/agencies/{agency}/owners/invite`.
 *
 * Authorization is performed by the controller via the policy
 * (`OwnerProfilePolicy@invite`) rather than here, so super_admin can
 * short-circuit the same way it does on every other surface.
 */
class InviteOwnerRequest extends BaseFormRequest
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
            'owner_type' => ['required', 'string', Rule::in(['individual', 'company'])],
            'company_name' => ['nullable', 'string', 'max:160', 'required_if:owner_type,company'],
        ];
    }
}
