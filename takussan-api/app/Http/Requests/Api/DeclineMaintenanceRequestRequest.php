<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-592 — `POST /api/maintenance-requests/{id}/decline {reason}`.
 *
 * L'autorisation court ICI, avant la validation (TCK-305) : un tiers qui poste un corps vide prend
 * un 403, pas un 422 qui lui apprendrait le contrat. Délégation à la policy.
 */
class DeclineMaintenanceRequestRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('respondToAssignment', $this->route('maintenanceRequest')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ];
    }
}
