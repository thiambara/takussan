<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/** TCK-594 (ADR-0039 §8) — valider une facture d'intervention : délégation à la policy. */
class ValidateServiceProviderBillRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage', $this->route('serviceProviderBill')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'rechargeable_to_landlord' => ['sometimes', 'boolean'],
            'provider_reference' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
