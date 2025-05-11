<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBookingPaymentRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->hasPermission('payments.update');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'booking_id' => 'sometimes|exists:bookings,id',
            'user_id' => 'nullable|exists:users,id',
            'amount' => 'sometimes|numeric|min:0',
            'payment_method' => 'sometimes|string|in:cash,bank_transfer,credit_card,mobile_money,cheque',
            'payment_type' => 'sometimes|string|in:deposit,installment,final_payment,full_payment',
            'transaction_id' => 'nullable|string|max:255',
            'status' => 'sometimes|string|in:pending,confirmed,failed,refunded',
            'payment_date' => 'sometimes|date',
            'confirmed_date' => 'nullable|date|after_or_equal:payment_date',
            'receipt_number' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'metadata' => 'nullable|array',
        ];
    }
}
