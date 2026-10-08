<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\MaintenanceStatus;

/**
 * TCK-592 (P10) — le demandeur conteste la réparation : `completed → in_progress`, avec ce qui ne va
 * pas (commentaire) et, s'il le peut, des photos. Les mêmes types d'image que les autres photos de
 * la demande.
 */
class ContestMaintenanceResolutionRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('respondToResolution', [$this->route('maintenanceRequest'), MaintenanceStatus::InProgress]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'comment' => ['required', 'string', 'min:3', 'max:2000'],
            'photos' => ['nullable', 'array', 'max:5'],
            'photos.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ];
    }
}
