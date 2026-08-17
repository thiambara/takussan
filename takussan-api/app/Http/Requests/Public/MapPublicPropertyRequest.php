<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-304/305 — extrait de PublicPropertyController::map(), ou les regles etaient inline.
 */
class MapPublicPropertyRequest extends BaseFormRequest
{
    /**
     * L'autorisation reste dans le controleur / la policy (principes 1 et 2, TCK-306).
     * `BaseFormRequest` refuse par defaut : sans cette surcharge, l'endpoint rendrait 403.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'bounds' => [
                'required',
                'string',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $parts = explode(',', (string) $value);
                    if (count($parts) !== 4) {
                        $fail(__('validation.bounds_format'));

                        return;
                    }
                    foreach ($parts as $p) {
                        if (! is_numeric(trim($p))) {
                            $fail(__('validation.bounds_format'));

                            return;
                        }
                    }
                    [$swLat, $swLng, $neLat, $neLng] = array_map('floatval', $parts);
                    if ($swLat < -90 || $swLat > 90 || $neLat < -90 || $neLat > 90
                        || $swLng < -180 || $swLng > 180 || $neLng < -180 || $neLng > 180) {
                        $fail(__('validation.bounds_format'));
                    }
                },
            ],
            'type' => ['nullable', 'string', 'max:100'],
            'contract_type' => ['nullable', 'in:sale,rent'],
            'price_min' => ['nullable', 'numeric', 'min:0'],
            'price_max' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
