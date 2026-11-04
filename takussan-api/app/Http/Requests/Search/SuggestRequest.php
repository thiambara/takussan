<?php

namespace App\Http\Requests\Search;

use App\Http\Requests\Public\SearchPublicPropertyRequest;
use App\Services\Search\Suggestions\SearchSuggestions;

/**
 * La saisie de la barre de recherche (`GET /api/search/suggest`), et — revue adverse n° 5 du 2026-11-04 (TCK-2474) —
 * la BASE de la liste qu'elle ouvrira : les filtres que la navigation garde (l'URL courante, « Louer / Acheter »), sous
 * les mêmes noms et la même validation que `GET /api/public/properties/search` ({@see SearchPublicPropertyRequest},
 * dont elle hérite la normalisation : booléens en chaîne, `cities` en liste, date écrêtée).
 *
 * Règle de fusion, appliquée par {@see SearchSuggestions::resolve()} et par le front :
 * un critère compris dans la saisie REMPLACE la même clé de la base ; les clés de la base absentes de la saisie sont
 * gardées. `interpretation.count` et `previews` se calculent sur la fusion ; `interpretation.criteria` reste ce que la
 * saisie a compris.
 */
class SuggestRequest extends SearchPublicPropertyRequest
{
    /**
     * Les paramètres de la liste publique qui en changent le RÉSULTAT (et `sort`, qui en change les premiers biens, donc
     * les aperçus). Hors base : la saisie (`q`, `search` : c'est `q` de la suggestion), et ce qui ne règle que la page
     * (`page`, `per_page`, `placements`, `seed_hour`).
     *
     * @var list<string>
     */
    public const BASE_KEYS = [
        'contract_type', 'type', 'rent_period', 'location', 'city', 'cities', 'region',
        'price_min', 'price_max', 'bedrooms', 'bathrooms', 'area_min', 'area_max',
        'furnished', 'featured', 'floor_number', 'title_type', 'condition', 'tags', 'available_from',
        'lat', 'lng', 'radius_km', 'lat_min', 'lat_max', 'lng_min', 'lng_max', 'sort',
    ];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            ...array_intersect_key(parent::rules(), array_flip(self::BASE_KEYS)),
            'q' => ['nullable', 'string', 'max:50'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:30'],
        ];
    }

    public function q(): string
    {
        return (string) ($this->validated()['q'] ?? '');
    }

    public function limit(): int
    {
        return (int) ($this->validated()['limit'] ?? 10);
    }

    /**
     * La base validée : les seules {@see self::BASE_KEYS} envoyées, sans valeur nulle.
     *
     * @return array<string, mixed>
     */
    public function base(): array
    {
        return array_filter(
            array_intersect_key($this->validated(), array_flip(self::BASE_KEYS)),
            static fn (mixed $value): bool => $value !== null && $value !== '' && $value !== [],
        );
    }
}
