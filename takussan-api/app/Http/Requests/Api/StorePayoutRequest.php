<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use App\Models\Payout;
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
     * TCK-528 — l'autorisation court ICI, avant la validation, comme pour les autres FormRequest
     * de TCK-305 : placée dans le contrôleur, un appelant sans la capacité recevrait 422 et le
     * détail des règles pour un corps mal formé, au lieu de 403.
     *
     * **Simple DÉLÉGATION** à `PayoutPolicy::create()` — la règle vit dans la policy. Cette
     * méthode rendait `true` : la capacité `payouts.create` n'était jugée nulle part.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('create', Payout::class) === true;
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
