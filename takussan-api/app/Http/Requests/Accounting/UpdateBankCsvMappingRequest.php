<?php

namespace App\Http\Requests\Accounting;

use Illuminate\Contracts\Validation\ValidationRule;
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

    /** Les champs dont le blanc n'a pas de sens : noms de colonnes et format de date. */
    private const TRIMMED = [
        'date_column', 'amount_column', 'label_column', 'reference_column', 'counterparty_column',
        'currency_column', 'direction_column', 'date_format',
    ];

    /**
     * TCK-593 (passe 2, N5) — l'exemption du trim global vaut pour les SÉPARATEURS, dont le blanc
     * est une valeur. Les noms de colonnes et le format de date, eux, sont rognés ici : ` amount `
     * enregistré tel quel faisait sauter toutes les lignes. Un nom vide après rognage vaut `null`,
     * et un séparateur de milliers vide veut dire « aucun ».
     */
    protected function prepareForValidation(): void
    {
        $clean = [];
        foreach (self::TRIMMED as $field) {
            $value = $this->input($field);
            if (is_string($value)) {
                $value = trim($value);
                $clean[$field] = $value === '' ? null : $value;
            }
        }
        if ($this->input('thousands_separator') === '') {
            $clean['thousands_separator'] = null;
        }

        $this->merge($clean);
    }

    /**
     * Une règle de liste qui juge AUSSI le blanc : la validation saute les règles non implicites
     * (`in:`, `string`) sur une chaîne blanche — `""` et `" "` passaient donc pour délimiteur.
     *
     * @param  list<string>  $allowed
     */
    private function strictlyOneOf(array $allowed, bool $nullable): ValidationRule
    {
        return new class($allowed, $nullable) implements ValidationRule
        {
            public bool $implicit = true;

            /** @param  list<string>  $allowed */
            public function __construct(private readonly array $allowed, private readonly bool $nullable) {}

            public function validate(string $attribute, mixed $value, \Closure $fail): void
            {
                if ($value === null && $this->nullable) {
                    return;
                }
                if (! in_array($value, $this->allowed, true)) {
                    $fail(__('validation.in', ['attribute' => $attribute]));
                }
            }
        };
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
            // tabulation en est une. La liste est jugée en comparaison stricte, blanc compris.
            'delimiter' => ['present', $this->strictlyOneOf([',', ';', "\t", '|'], false)],
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
            'thousands_separator' => [$this->strictlyOneOf(['.', ',', ' ', "'"], true), 'nullable', 'different:decimal_separator'],
        ];
    }
}
