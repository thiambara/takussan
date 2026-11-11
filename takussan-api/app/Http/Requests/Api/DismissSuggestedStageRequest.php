<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Crm\CustomerCommercialAttributes;
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
        // Vérification adverse de TCK-2591 — écarter la proposition de l'agence est un geste de
        // son personnel (la même borne que la lecture de `suggested_stage`), pas du bailleur auteur.
        $user = $this->user();
        $customer = $this->route('customer');

        return $user !== null
            && $user->can('update', $customer)
            && CustomerCommercialAttributes::staffReadable($user, [(int) $customer->getKey()]) !== [];
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason_event' => ['required', 'string', 'in:'.implode(',', array_keys(CustomerSuggestedStageQuery::FACTS))],
        ];
    }
}
