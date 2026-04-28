<?php

namespace App\Http\Requests\Accounting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class MatchBankStatementLineRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Policy handles authorization
    }

    public function rules(): array
    {
        return [
            'payment_type' => ['required', Rule::in(['booking_payment', 'lease_payment', 'invoice'])],
            'payment_id' => ['required', 'integer'],
        ];
    }
}
