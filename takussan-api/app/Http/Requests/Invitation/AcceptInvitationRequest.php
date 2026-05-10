<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-249 — payload validation for `POST /api/invitations/{token}/accept`.
 *
 * The endpoint is publicly reachable (no `auth:sanctum`); the token in the
 * URL is the bearer credential. Authorisation reduces to "the token is
 * still actionable" which the service enforces.
 */
class AcceptInvitationRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Optional new-user fields — required only if the email
            // doesn't yet map to a User (the controller falls back to
            // them to create the row). The service uses sensible
            // defaults (random password) when omitted, so the FormRequest
            // stays permissive and the per-role wizard tickets impose
            // their own stricter rules downstream.
            'first_name' => ['nullable', 'string', 'max:120'],
            'last_name' => ['nullable', 'string', 'max:120'],
            'password' => ['nullable', 'string', 'min:8'],
        ];
    }
}
