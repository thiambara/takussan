<?php

namespace App\Http\Requests\Public;

/**
 * TCK-304/305 — extrait de PublicPropertyController::map(), ou les regles etaient inline.
 *
 * TCK-633 (lot E, AC6) — la carte HERITE des regles de la liste. Elle n'en acceptait que quatre
 * (type, transaction, prix) plus le rayon : tout autre filtre du panneau etait jete par
 * `validated()`, et la vue carte montrait des biens que la liste venait d'ecarter, sur le meme
 * ecran. Heriter plutot que recopier : une cle ajoutee a la liste arrive ici d'elle-meme, et
 * `MapFiltersParityTest` exige alors qu'elle soit appliquee par `FiltresDeLaCarte`.
 *
 * Herites tels quels : `authorize()` (true), `prepareForValidation()` (`furnished`/`featured`
 * en booleen, `available_from` ecretee au present) et le contrat « point + rayon »
 * (`FiltreParPointEtRayon`, ADR-0023, TCK-346).
 */
class MapPublicPropertyRequest extends SearchPublicPropertyRequest
{
    /**
     * Les cles de la LISTE qui n'ont pas de sens sur la carte :
     *
     * - `q`, `search` : la recherche plein-texte passe par Meilisearch ; `/map` est SQL (ADR-0023),
     *   et recomposer Scout + Eloquent ici creerait un second chemin, ce que `takussan-api/CLAUDE.md`
     *   (§ Recherche) interdit ;
     * - `sort` : decision motivee dans `PublicPropertyController::map()` (`PropertyMapRadiusTest::
     *   test_map_ne_declare_aucun_tri`) ;
     * - `page`, `per_page` : la carte est un GeoJSON plafonne, sans pagination ;
     * - `lat_min` … `lng_max` : le rectangle de la liste ; la carte a le sien, `bounds` ;
     * - `placements` : la carte ne sert aucun emplacement (TCK-687) ;
     * - `seed_hour` : l'heure de graine de la rotation des emplacements (TCK-998).
     *
     * ⚠ Miroir de `CLES_PROPRES_A_LA_LISTE` dans `takussan-web/src/lib/recherche-publique.ts` :
     * `search-filters.parity.test.ts` compare les deux listes.
     */
    public const CLES_PROPRES_A_LA_LISTE = ['q', 'search', 'sort', 'page', 'per_page', 'lat_min', 'lat_max', 'lng_min', 'lng_max', 'placements', 'seed_hour'];

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

            // Le rayon se CONJOINT (ET) au rectangle `bounds`, exactement comme il se conjoint au
            // `_geoBoundingBox` de `/search`. `bounds` reste `required` : la carte demande toujours
            // un cadrage, le rayon ne le remplace pas.
            //
            // ⚠ PAS de `sort` ici, et c'est une decision, pas un oubli — voir
            // `PublicPropertyController::map()`.
            ...array_diff_key(parent::rules(), array_flip(self::CLES_PROPRES_A_LA_LISTE)),
        ];
    }
}
