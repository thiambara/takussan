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
     * Même autorisation que l'encaissement du loyer (`MarkPaidLeasePaymentRequest`) : la règle vit
     * dans la policy du bail, et le locataire en est exclu. `LeasePaymentPolicy::update`, que le
     * ticket nommait, admet le LOCATAIRE (c'est elle qui ouvre le checkout) : un locataire aurait pu
     * déclarer sa propre pénalité réglée.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('payment')?->lease) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'paid_at' => ['nullable', 'date'],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
        ];
    }
}
