<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Crm\CustomerSuggestedStageQuery;

/**
 * TCK-2591 — `POST /api/customers/{customer}/suggested-stage/dismiss` : écarter la proposition
 * courante (« Plus tard »). Délégation à `CustomerPolicy::update`, avant la validation.
 * `reason_event` nomme le fait que l'agent a vu : s'il n'est plus celui de la proposition
 * courante, l'écart est refusé (409) plutôt que d'écarter un fait qu'il n'a pas lu.
 */
class DismissSuggestedStageRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('customer')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason_event' => ['required', 'string', 'in:'.implode(',', array_keys(CustomerSuggestedStageQuery::FACTS))],
        ];
    }
}
