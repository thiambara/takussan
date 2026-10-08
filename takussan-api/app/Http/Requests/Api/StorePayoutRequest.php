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

    /**
     * TCK-594 (ADR-0039 §3) — le brut n'est plus une saisie. `gross_amount`, `commission_amount`,
     * `fees_amount` sont `prohibited` : le service les recalcule depuis les pièces citées. `lease_id`
     * et `booking_id` le sont aussi — ils se déduisent des paiements. Au moins une pièce est exigée.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $oneItem = 'required_without_all:lease_payment_ids,booking_payment_ids,service_provider_bill_ids';

        return [
            'landlord_id' => ['required', 'integer', 'exists:users,id'],
            'agency_id' => ['nullable', 'integer', 'exists:agencies,id'],
            'lease_payment_ids' => ['nullable', 'array', 'max:500', $oneItem],
            'lease_payment_ids.*' => ['integer', 'distinct'],
            'booking_payment_ids' => ['nullable', 'array', 'max:500', $oneItem],
            'booking_payment_ids.*' => ['integer', 'distinct'],
            'service_provider_bill_ids' => ['nullable', 'array', 'max:100', $oneItem],
            'service_provider_bill_ids.*' => ['integer', 'distinct'],
            'payout_method_id' => ['nullable', 'integer'],
            'lease_id' => ['prohibited'],
            'booking_id' => ['prohibited'],
            'gross_amount' => ['prohibited'],
            'commission_amount' => ['prohibited'],
            'fees_amount' => ['prohibited'],
            'period_start' => ['nullable', 'date'],
            'period_end' => ['nullable', 'date', 'after_or_equal:period_start'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'scheduled_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
