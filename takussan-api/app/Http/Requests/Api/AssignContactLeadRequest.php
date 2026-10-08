<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\PropertyContactLead;
use App\Rules\PersonnelDeLAgence;

/**
 * TCK-590 — attribuer une demande à un membre du personnel de son agence. Délégation à
 * `PropertyContactLeadPolicy::assign` (`crm.assign`), avant la validation.
 */
class AssignContactLeadRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('assign', $this->route('lead')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $lead = $this->route('lead');

        return [
            'user_id' => ['required', 'integer', new PersonnelDeLAgence($lead instanceof PropertyContactLead ? $lead->agency_id : null)],
        ];
    }
}
