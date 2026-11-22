<?php

namespace App\Http\Requests;

use App\Models\Enums\PaymentProvider;
use Illuminate\Validation\Rule;

class InitiatePaymentRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'provider' => ['required', Rule::in(array_column(PaymentProvider::cases(), 'value'))],
            'return_url' => ['nullable', 'url'],
            'cancel_url' => ['nullable', 'url'],
        ];
    }
}
