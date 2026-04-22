<?php

namespace App\Http\Requests;

use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use Illuminate\Validation\Rule;

class PaymentStoreRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $payableType = strtolower((string) $this->input('payable_type'));

        $rules = [
            'payable_type' => ['required', 'string', Rule::in(['booking', 'lease'])],
            'payable_id' => ['required', 'integer', 'min:1'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'status' => ['nullable', Rule::enum(PaymentStatus::class)],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'paid_at' => ['nullable', 'date'],
            'transaction_id' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            // Lease-specific
            'period_start' => ['nullable', 'date', 'required_if:payable_type,lease'],
            'period_end' => ['nullable', 'date', 'required_if:payable_type,lease', 'after_or_equal:period_start'],
            'due_date' => ['nullable', 'date'],
        ];

        if ($payableType === 'booking') {
            $rules['payment_type'] = ['required', Rule::enum(BookingPaymentType::class)];
        } elseif ($payableType === 'lease') {
            $rules['payment_type'] = ['required', Rule::enum(LeasePaymentType::class)];
        } else {
            // Unknown/missing payable_type — let validation surface it via payable_type rule.
            $rules['payment_type'] = ['required', 'string'];
        }

        return $rules;
    }
}
