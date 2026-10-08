<?php

namespace App\Http\Requests\ServiceProvider;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\CollaborationStatus;
use Illuminate\Validation\Rule;

/**
 * TCK-592 — `PATCH /api/agencies/{agency}/service-providers/{sp_profile}/collaboration {status}`.
 * Autorisation avant validation (TCK-305), par délégation à la policy.
 */
class UpdateServiceProviderCollaborationRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manageCollaboration', [$this->route('sp_profile'), $this->route('agency')]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::enum(CollaborationStatus::class)],
        ];
    }
}
