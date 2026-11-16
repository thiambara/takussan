<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use Illuminate\Validation\Rule;

/**
 * TCK-2911 (ADR-0120 § 3) — un devis concurrent consulté : un prestataire du compte OU un nom libre,
 * un montant, une pièce facultative (PDF ou image, la règle de `SubmitQuoteRequest`). L'autorisation
 * (`manageQuoteAlternatives`, 403) court avant la validation.
 */
class StoreMaintenanceQuoteAlternativeRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manageQuoteAlternatives', $this->route('maintenanceRequest')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'provider_id' => ['nullable', 'integer', Rule::exists('users', 'id')->withoutTrashed()],
            'provider_name' => ['required_without:provider_id', 'nullable', 'string', 'max:150'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'currency' => ['nullable', 'string', Rule::enum(Currency::class)],
            'file' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:5120'],
        ];
    }
}
