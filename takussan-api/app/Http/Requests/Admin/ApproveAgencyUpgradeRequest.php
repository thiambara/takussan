<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-268 — payload validation for
 * `POST /api/admin/agency-upgrade-requests/{id}/approve`.
 *
 * Authorization is enforced by the `super-admin` middleware on the route
 * group. We accept an optional internal-note `comment` so the super-admin
 * can leave context for downstream observers (kept on the request row).
 */
class ApproveAgencyUpgradeRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'comment' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
