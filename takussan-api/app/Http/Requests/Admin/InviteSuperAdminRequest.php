<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Services\Auth\SuperAdminCooptationService;

/**
 * TCK-264 — payload validation for `POST /api/admin/super-admins/invite`.
 *
 * Authorization is enforced by the `super-admin` middleware on the route
 * and re-checked defensively inside {@see SuperAdminCooptationService}.
 */
class InviteSuperAdminRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email:rfc'],
            'first_name' => ['required', 'string', 'max:120'],
            'last_name' => ['required', 'string', 'max:120'],
        ];
    }
}
