<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Foundation\Http\FormRequest;

class MarkPlatformPayoutPaidRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'processed_at' => ['required', 'date'],
            // TCK-594 (ADR-0039 §4) — l'argent parti se prouve : la référence du virement.
            'payment_reference' => ['required', 'string', 'max:255'],
            'metadata' => ['nullable', 'array'],
            'metadata.bank_ref' => ['nullable', 'string', 'max:255'],
            'metadata.batch_id' => ['nullable', 'string', 'max:255'],
        ];
    }
}
