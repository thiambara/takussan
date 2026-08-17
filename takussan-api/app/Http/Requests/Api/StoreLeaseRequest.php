<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de LeaseController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreLeaseRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'property_id' => ['required', 'exists:properties,id'],
            'tenant_id' => ['required', 'exists:customers,id'],
            'booking_id' => ['nullable', Rule::exists('bookings', 'id')->where('property_id', $this->input('property_id'))],
            'guarantor_id' => ['nullable', 'exists:guarantors,id'],
            'type' => ['required', Rule::enum(LeaseType::class)],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after:start_date'],
            'monthly_rent' => ['nullable', 'numeric', 'min:0'],
            'sale_price' => ['nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'payment_frequency' => ['nullable', Rule::enum(PaymentFrequency::class)],
            'payment_day' => ['nullable', 'integer', 'between:1,28'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'terms' => ['nullable', 'string'],
        ];
    }
}
