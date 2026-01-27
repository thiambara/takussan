<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreBookingPaymentRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->hasPermissionTo('payments.create');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'booking_id' => 'required|exists:bookings,id',
            'user_id' => 'nullable|exists:users,id',
            'amount' => 'required|numeric|min:0',
            'payment_method' => 'required|string|in:cash,bank_transfer,credit_card,mobile_money,cheque',
            'payment_type' => 'required|string|in:deposit,installment,final_payment,full_payment',
            'transaction_id' => 'nullable|string|max:255',
            'status' => 'required|string|in:pending,confirmed,failed,refunded',
            'payment_date' => 'required|date',
            'confirmed_date' => 'nullable|date|after_or_equal:payment_date',
            'receipt_number' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'metadata' => 'nullable|array',
        ];
    }
}
