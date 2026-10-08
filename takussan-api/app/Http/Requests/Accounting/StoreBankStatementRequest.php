<?php

namespace App\Http\Requests\Accounting;

use App\Models\BankStatement;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\BankStatementStatus;
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
                // TCK-593 (vérification adverse, R6) — un CSV qui n'est pas de l'UTF-8 valide
                // (export latin-1) faisait échouer l'insertion (`SQLSTATE[22021]`) : relevé `failed`,
                // zéro ligne sautée, rien ne disait « encodage ». Refusé à l'import, avec la raison.
                // L'OFX déclare son jeu de caractères dans son en-tête : il n'est pas jugé ici.
                if ($this->input('source_format') === 'csv'
                    && ! mb_check_encoding((string) file_get_contents($this->file('file')->getRealPath()), 'UTF-8')) {
                    $validator->errors()->add('file', __('reconciliation.validation.file_not_utf8'));

                    return;
                }

                $hash = hash_file('sha256', $this->file('file')->getRealPath());
                $this->merge(['file_hash' => $hash]);

                $agency = $this->route('agency');
                // TCK-593 — un relevé `failed` ne bloque pas le ré-import du même fichier, une fois le
                // mapping corrigé : le contrôleur le remplace.
                if ($agency && BankStatement::where('agency_id', $agency->id)->where('file_hash', $hash)
                    ->where('status', '!=', BankStatementStatus::Failed)->exists()) {
                    $validator->errors()->add('file', __('reconciliation.validation.duplicate_file'));
                }
            }
        });
    }
}
