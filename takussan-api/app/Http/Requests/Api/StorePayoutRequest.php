<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PayoutController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StorePayoutRequest extends BaseFormRequest
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
            'landlord_id' => ['required', 'exists:users,id'],
            'lease_id' => ['nullable', 'exists:leases,id'],
            'booking_id' => ['nullable', 'exists:bookings,id'],
            'period_start' => ['nullable', 'date'],
            'period_end' => ['nullable', 'date', 'after_or_equal:period_start'],
            'gross_amount' => ['required', 'numeric', 'min:0'],
            'commission_amount' => ['nullable', 'numeric', 'min:0'],
            'fees_amount' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'scheduled_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
