<?php

namespace App\Http\Requests\Concerns;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Rules\TelephoneJoignable;
use App\Services\Crm\CustomerPhoneNormalizer;
use Illuminate\Validation\Rule;

/**
 * TCK-591 — ce que la création et la mise à jour d'un client partagent : le téléphone normalisé
 * AVANT d'être jugé (« 77 123 45 67 » est valide une fois ramené en `+221771234567`), le drapeau
 * `allow_duplicate`, et les critères de recherche du prospect.
 */
trait ValidatesCustomerContactAndCriteria
{
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        $normalized = [];
        foreach (['phone', 'emergency_contact_phone'] as $field) {
            if (is_string($this->input($field))) {
                $normalized[$field] = CustomerPhoneNormalizer::normalize($this->input($field));
            }
        }
        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }

    /**
     * @return array<string, mixed>
     */
    protected function contactAndCriteriaRules(string $presence): array
    {
        $optional = array_filter([$presence, 'nullable']);

        return [
            'phone' => [...$optional, 'string', 'max:32', new TelephoneJoignable],
            'emergency_contact_name' => [...$optional, 'string', 'max:255'],
            'emergency_contact_phone' => [...$optional, 'string', 'max:32', new TelephoneJoignable],
            'allow_duplicate' => ['sometimes', 'boolean'],
            'seeking_contract_type' => [...$optional, Rule::enum(ContractType::class)],
            'budget_min' => [...$optional, 'numeric', 'min:0'],
            'budget_max' => [...$optional, 'numeric', 'min:0', 'gte:budget_min'],
            'seeking_property_types' => [...$optional, 'array', 'max:20'],
            'seeking_property_types.*' => [Rule::enum(PropertyType::class)],
            'seeking_cities' => [...$optional, 'array', 'max:20'],
            'seeking_cities.*' => ['string', 'max:100'],
            'seeking_neighborhoods' => [...$optional, 'array', 'max:30'],
            'seeking_neighborhoods.*' => ['string', 'max:100'],
            'min_bedrooms' => [...$optional, 'integer', 'min:0', 'max:50'],
        ];
    }
}
