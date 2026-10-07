<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PaymentMethod;
use Illuminate\Validation\Rule;

/**
 * TCK-593 — `POST lease-payments/{payment}/late-fee/mark-paid` : la pénalité réglée à l'agence.
 */
class MarkLateFeePaidRequest extends BaseFormRequest
{
    /**
     * Même autorisation que l'encaissement du loyer (`MarkPaidLeasePaymentRequest`) :
     * `LeasePolicy::recordPayment` (TCK-587) — le personnel titulaire de `payments.record`, ou le
     * bailleur du bail tant qu'il n'est pas bloqué dans l'agence (`landlordWrites`). Le locataire en
     * est exclu : `LeasePaymentPolicy::update`, que le ticket nommait, l'admet (c'est elle qui ouvre
     * le checkout), et il aurait pu déclarer sa propre pénalité réglée.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('recordPayment', $this->route('payment')?->lease) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-593 (vérification adverse, V7) — un règlement ne se date pas dans le futur.
            'paid_at' => ['nullable', 'date', 'before_or_equal:now'],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
        ];
    }
}
