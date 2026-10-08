<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\MaintenanceStatus;

/**
 * TCK-592 (P10) — le demandeur confirme la réparation : `completed → closed`.
 */
class ConfirmMaintenanceResolutionRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('respondToResolution', [$this->route('maintenanceRequest'), MaintenanceStatus::Closed]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
