<?php

namespace App\Http\Requests\Accounting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * TCK-593 — le séparateur décimal est REQUIS : il n'est plus jamais deviné (`150,000` lu 150 sur
 * un export anglo-saxon, erreur ×1000). Les colonnes se désignent par leur nom d'en-tête, ou par
 * leur position quand le fichier n'a pas d'en-tête.
 *
 * Le corps échappe à `TrimStrings` et `ConvertEmptyStringsToNull` (`bootstrap/app.php`, comme
 * le brouillon de TCK-574) : le délimiteur tabulation et le séparateur de milliers espace SONT
 * des blancs, et le trim les réduisait à `null` — un mapping tabulé devenait impossible à écrire.
 */
class UpdateBankCsvMappingRequest extends FormRequest
{
    /**
     * Le middleware global court AVANT le routage : seul le chemin se lit.
     */
    public static function estEcritureDeMapping(Request $request): bool
    {
        return $request->isMethod('PUT') && $request->is('api/agencies/*/bank-statements/csv-mapping');
    }

    public function authorize(): bool
    {
        return true; // Policy handles authorization
    }

    public function rules(): array
    {
        $column = fn (bool $required) => [
            $required ? 'required' : 'nullable',
            function (string $attribute, mixed $value, \Closure $fail): void {
                if ($value !== null && ! is_string($value) && ! is_int($value)) {
                    $fail(__('reconciliation.validation.csv_column'));
                }
            },
        ];

        return [
            // `present` et non `required` : `required` tient une chaîne blanche pour vide, et la
            // tabulation en est une.
            'delimiter' => ['present', 'string', Rule::in([',', ';', "\t", '|'])],
            'has_header' => ['required', 'boolean'],
            'date_column' => $column(true),
            'date_format' => ['required', 'string', 'max:32'],
            'amount_column' => $column(true),
            'label_column' => $column(false),
            'reference_column' => $column(false),
            'counterparty_column' => $column(false),
            'currency_column' => $column(false),
            'sign_convention' => ['required', Rule::in(['amount_signed', 'direction_column'])],
            'direction_column' => array_merge($column(false), ['required_if:sign_convention,direction_column']),
            'decimal_separator' => ['required', Rule::in(['.', ','])],
            'thousands_separator' => ['nullable', Rule::in(['.', ',', ' ', "'"]), 'different:decimal_separator'],
        ];
    }
}
