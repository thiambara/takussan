<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\FiltreParPointEtRayon;

/**
 * TCK-304/305 — extrait de PublicPropertyController::map(), ou les regles etaient inline.
 */
class MapPublicPropertyRequest extends BaseFormRequest
{
    /**
     * `lat`, `lng`, `radius_km` et `RADIUS_KM_MAX` — le MEME contrat que
     * `SearchPublicPropertyRequest`, defini une seule fois (ADR-0023, TCK-346).
     *
     * Sans lui, un visiteur qui posait « a moins de 3 km » sur la liste puis
     * basculait en vue carte voyait reapparaitre les biens que la liste venait
     * d'ecarter : le filtre disparaissait EN SILENCE a la bascule, sur le meme
     * ecran (`PropertiesDiscoveryPage`, `View = 'list' | 'map'`).
     */
    use FiltreParPointEtRayon;

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

            // ── GEO, contrat « point + rayon » (ADR-0023, TCK-346) ────────────
            // Le rayon se CONJOINT (ET) au rectangle `bounds`, exactement comme
            // il se conjoint au `_geoBoundingBox` de `/search`. `bounds` reste
            // `required` : la carte demande toujours un cadrage, le rayon ne le
            // remplace pas.
            //
            // ⚠ PAS de `sort` ici, et c'est une decision, pas un oubli — voir
            // `PublicPropertyController::map()`.
            ...$this->reglesPointEtRayon(),
        ];
    }
}
