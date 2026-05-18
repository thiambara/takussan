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
            'metadata' => ['nullable', 'array'],
            'metadata.bank_ref' => ['nullable', 'string', 'max:255'],
            'metadata.batch_id' => ['nullable', 'string', 'max:255'],
        ];
    }
}
