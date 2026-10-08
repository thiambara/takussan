<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PlatformProfileLevel;
use App\Services\Auth\SuperAdminCooptationService;
use Illuminate\Validation\Rule;

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
            // TCK-600 (ADR-0047) — le NIVEAU de l'opérateur coopté ; `super_admin` par défaut.
            'level' => ['nullable', 'string', Rule::enum(PlatformProfileLevel::class)],
        ];
    }
}
