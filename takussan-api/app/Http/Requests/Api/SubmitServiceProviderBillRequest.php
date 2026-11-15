<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2911 (ADR-0120 § 1) — « Facturer » : le prestataire de la facture seul envoie son brouillon,
 * avec, s'il le veut, le montant final, son numéro de facture et sa pièce (PDF ou image : la sortie
 * privée sert un média en `inline`, la règle de `SubmitQuoteRequest`).
 */
class SubmitServiceProviderBillRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('submit', $this->route('serviceProviderBill')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'amount' => ['nullable', 'numeric', 'gt:0', 'max:999999999999'],
            'provider_reference' => ['nullable', 'string', 'max:100'],
            'file' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:5120'],
        ];
    }
}
