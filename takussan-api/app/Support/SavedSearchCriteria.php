<?php

namespace App\Support;

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
            $attribute.'.radius_km' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            $attribute.'.lat' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            $attribute.'.lng' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            $attribute.'.contract_type' => ['sometimes', 'nullable', 'string', 'max:40'],
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
            $attribute.'.title_type' => ['sometimes', 'nullable', 'string', 'max:40'],
        ];
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
