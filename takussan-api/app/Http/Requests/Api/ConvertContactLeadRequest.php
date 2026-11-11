<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Customer;
use App\Models\PropertyContactLead;
use App\Rules\ClientDeLAgence;

/**
 * TCK-590 — convertir une demande en fiche client. Délégation à
 * `PropertyContactLeadPolicy::convert`, avant la validation. La fiche se construit depuis la
 * demande ; seul `allow_duplicate` se reçoit, comme à la création (TCK-1343).
 *
 * TCK-2582 — ou la rattacher à une fiche EXISTANTE (`customer_id`, le doublon choisi) : une fiche
 * de l'agence de la demande (`ClientDeLAgence`) que l'appelant lit (`CustomerPolicy::view`, jugée
 * avant la validation : la fiche d'une autre agence rend 403, pas 422).
 */
class ConvertContactLeadRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        if ($this->user()?->can('convert', $this->route('lead')) !== true) {
            return false;
        }

        // TCK-2582 — la fiche choisie doit être lisible par l'appelant ; absente, la validation le dit.
        $customerId = $this->input('customer_id');
        $customer = is_numeric($customerId) ? Customer::query()->find((int) $customerId) : null;

        return $customer === null || $this->user()->can('view', $customer);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $lead = $this->route('lead');

        return [
            'allow_duplicate' => ['sometimes', 'boolean'],
            // TCK-2582 — le rattachement à une fiche existante de l'agence de la demande.
            'customer_id' => ['sometimes', 'nullable', 'integer', new ClientDeLAgence(
                $lead instanceof PropertyContactLead && $lead->agency_id !== null ? (int) $lead->agency_id : null,
            )],
        ];
    }
}
