<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Customer;

/**
 * TCK-2588 — `GET /api/customers/duplicates?phone=&email=` : la sonde de doublon pendant la saisie.
 * Délégation à `CustomerPolicy::create` (le personnel de l'agence active ; 403 au bailleur,
 * TCK-591 § 9), avant la validation.
 */
class ProbeCustomerDuplicateRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Customer::class) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'phone' => ['nullable', 'string', 'max:32', 'required_without:email'],
            'email' => ['nullable', 'string', 'max:255', 'required_without:phone'],
        ];
    }
}
