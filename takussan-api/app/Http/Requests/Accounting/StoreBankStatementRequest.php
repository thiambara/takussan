<?php

namespace App\Http\Requests\Accounting;

use App\Models\BankStatement;
use App\Models\Enums\BankStatementSourceFormat;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Enum;

class StoreBankStatementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Policy handles fine-grained authorization
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:10240', 'mimes:csv,txt,ofx'],
            'source_format' => ['nullable', new Enum(BankStatementSourceFormat::class)],
            'bank_name' => ['nullable', 'string', 'max:120'],
            'account_iban' => ['nullable', 'string', 'max:34', 'regex:/^[A-Z0-9]+$/'],
        ];
    }

    protected function prepareForValidation(): void
    {
        // Auto-detect source_format from file extension if not provided
        if (! $this->has('source_format') && $this->hasFile('file')) {
            $ext = strtolower($this->file('file')->getClientOriginalExtension());
            $this->merge([
                'source_format' => $ext === 'ofx' ? 'ofx' : 'csv',
            ]);
        }
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->hasFile('file')) {
                $hash = hash_file('sha256', $this->file('file')->getRealPath());
                $this->merge(['file_hash' => $hash]);

                $agency = $this->route('agency');
                if ($agency && BankStatement::where('agency_id', $agency->id)->where('file_hash', $hash)->exists()) {
                    $validator->errors()->add('file', __('reconciliation.validation.duplicate_file'));
                }
            }
        });
    }
}
