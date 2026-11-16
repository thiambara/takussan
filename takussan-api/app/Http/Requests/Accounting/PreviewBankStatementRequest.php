<?php

namespace App\Http\Requests\Accounting;

use App\Http\Requests\BaseFormRequest;
use App\Models\BankStatement;

/**
 * TCK-2932 — `POST …/bank-statements/preview` : le MÊME corps que l'import
 * ({@see StoreBankStatementRequest::bodyRules()}), le même droit, le même refus d'un CSV qui n'est
 * pas de l'UTF-8. Un fichier déjà importé n'est pas refusé : l'aperçu le dit (`already_imported`).
 */
class PreviewBankStatementRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', [BankStatement::class, $this->route('agency')]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return StoreBankStatementRequest::bodyRules($this->input('source_format'));
    }

    protected function prepareForValidation(): void
    {
        if (! $this->filled('source_format') && $this->hasFile('file')) {
            $ext = strtolower($this->file('file')->getClientOriginalExtension());
            $this->merge(['source_format' => $ext === 'ofx' ? 'ofx' : 'csv']);
        }
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->hasFile('file') && $this->input('source_format') === 'csv'
                && ! mb_check_encoding((string) file_get_contents($this->file('file')->getRealPath()), 'UTF-8')) {
                $validator->errors()->add('file', __('reconciliation.validation.file_not_utf8'));
            }
        });
    }
}
