<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PaymentMethod;
use Illuminate\Validation\Rule;

/** TCK-594 (ADR-0039 §8) — le reversement au prestataire, soumis aux règles de tout reversement. */
class PayServiceProviderBillRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage', $this->route('serviceProviderBill')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'payout_method_id' => ['nullable', 'integer'],
            'scheduled_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
