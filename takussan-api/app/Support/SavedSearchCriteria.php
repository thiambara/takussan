<?php

namespace App\Support;

use App\Http\Requests\Public\SearchPublicPropertyRequest;
use App\Models\Enums\PropertyCondition;
use App\Models\Enums\TitleType;
use Closure;
use Illuminate\Validation\Rule;

/**
 * TCK-599 (ADR-0050 §2) — le vocabulaire FERMÉ de `saved_searches.criteria`, écrit une seule fois.
 *
 * Ce sont les 22 clés de rôle `filtre` de `SEARCH_FILTER_KEYS` (`takussan-web/src/types/search.ts`)
 * — celles qu'écrit `filtersToCriteria()` — plus `cities`, qu'écrit le formulaire de préférences.
 * `criteria` était validé `['required', 'array']` : une clé inconnue était stockée, puis ignorée
 * par le moteur, et l'alerte prévenait de biens que la personne n'avait pas demandés (11 clés sur
 * 22 l'étaient). Ici, toute autre clé rend 422 — à la création comme à la modification, par la
 * MÊME règle ({@see self::rules()}).
 *
 * `SavedSearchCriteriaVocabularyTest` prouve, clé par clé, que chacune filtre réellement : une clé
 * ajoutée ici sans être lue par `PropertySearchService::buildFilter()` le fait rougir.
 *
 * Fermé sur les VALEURS aussi (verif-599 m4) : les règles de valeur de `/properties`
 * (`SearchPublicPropertyRequest`) s'appliquent ici. Une liste imbriquée dans `type` faisait
 * échouer l'alerte chaque jour (« Array to string conversion ») ; un rayon sans point n'était
 * jamais appliqué ; `contract_type=louer` était stocké quand `/properties` le refuse.
 */
final class SavedSearchCriteria
{
    /** @var list<string> */
    public const KEYS = [
        'q', 'location', 'city', 'radius_km', 'lat', 'lng', 'contract_type', 'type', 'rent_period',
        'price_min', 'price_max', 'bedrooms', 'bathrooms', 'area_min', 'area_max', 'furnished',
        'featured', 'floor_number', 'available_from', 'title_type', 'condition', 'tags',
        'cities',
    ];

    /** Les clés multi-valuées : le front les écrit en tableau, l'URL en liste à virgules. */
    private const LIST_KEYS = ['type', 'condition', 'tags'];

    /**
     * La règle de `criteria`, identique pour `StoreSavedSearchRequest` (`required`),
     * `UpdateSavedSearchRequest` (`sometimes`) et l'alerte sans compte.
     *
     * @return array<string, list<string>>
     */
    public static function rules(string $presence, string $attribute = 'criteria'): array
    {
        return [
            $attribute => [$presence, 'array:'.implode(',', self::KEYS)],
            $attribute.'.q' => ['sometimes', 'nullable', 'string', 'max:200'],
            $attribute.'.location' => ['sometimes', 'nullable', 'string', 'max:120'],
            $attribute.'.city' => ['sometimes', 'nullable', 'string', 'max:120'],
            $attribute.'.cities' => ['sometimes', 'array', 'max:20'],
            $attribute.'.cities.*' => ['string', 'max:120'],
            // Le contrat « point + rayon » de `/properties` (ADR-0023) : le rayon exige le point.
            $attribute.'.radius_km' => ['sometimes', 'nullable', 'numeric', 'gt:0', 'max:'.SearchPublicPropertyRequest::RADIUS_KM_MAX],
            // Sans `sometimes` : `required_with` doit pouvoir réclamer une coordonnée ABSENTE.
            $attribute.'.lat' => ['nullable', 'numeric', 'between:-90,90', 'required_with:'.$attribute.'.lng,'.$attribute.'.radius_km'],
            $attribute.'.lng' => ['nullable', 'numeric', 'between:-180,180', 'required_with:'.$attribute.'.lat,'.$attribute.'.radius_km'],
            $attribute.'.contract_type' => ['sometimes', 'nullable', 'in:sale,rent'],
            $attribute.'.type' => ['sometimes', 'nullable', self::listeDeChaines(500)],
            $attribute.'.tags' => ['sometimes', 'nullable', self::listeDeChaines(500)],
            $attribute.'.condition' => ['sometimes', 'nullable', self::listeDeChaines(100, fn (string $v) => PropertyCondition::tryFrom($v) !== null)],
            $attribute.'.rent_period' => ['sometimes', 'nullable', 'string', 'max:40'],
            $attribute.'.price_min' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            $attribute.'.price_max' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            $attribute.'.bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            $attribute.'.bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0'],
            $attribute.'.area_min' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            $attribute.'.area_max' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            $attribute.'.furnished' => ['sometimes', 'nullable', 'boolean'],
            $attribute.'.featured' => ['sometimes', 'nullable', 'boolean'],
            $attribute.'.floor_number' => ['sometimes', 'nullable', 'integer'],
            $attribute.'.available_from' => ['sometimes', 'nullable', 'date'],
            $attribute.'.title_type' => ['sometimes', 'nullable', Rule::enum(TitleType::class)],
        ];
    }

    /**
     * Une clé multi-valuée : une chaîne (`a,b`, la forme de l'URL) ou une liste PLATE de chaînes
     * (la forme du front), chaque valeur acceptée par `$valide`. Une liste imbriquée, un objet ou
     * un nombre rendent 422.
     *
     * @param  (Closure(string): bool)|null  $valide
     */
    private static function listeDeChaines(int $max, ?Closure $valide = null): Closure
    {
        return function (string $attribut, mixed $valeur, Closure $echec) use ($max, $valide): void {
            $valeurs = is_string($valeur) ? explode(',', $valeur) : $valeur;
            if (! is_array($valeurs) || ! array_is_list($valeurs)
                || mb_strlen(is_string($valeur) ? $valeur : implode(',', array_filter($valeurs, 'is_string'))) > $max) {
                $echec(__('validation.array', ['attribute' => $attribut]));

                return;
            }
            foreach ($valeurs as $v) {
                // Un champ laissé vide : `BaseFormRequest` l'a ramené à null, ce n'est pas une forme.
                if ($v === null) {
                    continue;
                }
                if (! is_string($v) || ($valide !== null && ! $valide(trim($v)))) {
                    $echec(__('validation.in', ['attribute' => $attribut]));

                    return;
                }
            }
        };
    }

    /**
     * Les paramètres de `PropertySearchService::buildFilter()` pour ces critères : les clés
     * multi-valuées ramenées à une forme que le moteur lit, `cities` à une liste de chaînes.
     * Une clé hors vocabulaire (ligne antérieure à la migration) n'est jamais transmise.
     *
     * @param  array<string, mixed>  $criteria
     * @return array<string, mixed>
     */
    public static function toSearchParams(array $criteria): array
    {
        $params = array_intersect_key($criteria, array_flip(self::KEYS));

        foreach (self::LIST_KEYS as $key) {
            if (isset($params[$key]) && is_array($params[$key])) {
                $params[$key] = implode(',', array_map('strval', $params[$key]));
            }
        }
        if (array_key_exists('cities', $params)) {
            $params['cities'] = array_values(array_filter(
                array_map(fn (mixed $c) => trim((string) $c), (array) $params['cities']),
                fn (string $c) => $c !== '',
            ));
        }

        return $params;
    }
}
