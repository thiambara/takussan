<?php

namespace App\Http\Requests\Public;

use App\Services\Search\RepartitionDesPrix;

/**
 * TCK-2498 — `GET /api/public/properties/price-distribution` : les filtres de la liste publique (même noms, même
 * validation, même normalisation — {@see SearchPublicPropertyRequest}), SANS ce qui ne change pas l'ensemble des biens
 * comptés : les bornes de prix (l'histogramme sert à les choisir), le tri, la page, les emplacements, la graine, et ce
 * qui n'est pas une recherche (`published_after`). `contract_type` est OBLIGATOIRE : un loyer et un prix de vente n'ont
 * pas la même échelle, et un histogramme qui les mêlerait ne situerait aucun budget ({@see RepartitionDesPrix}).
 */
class PriceDistributionRequest extends SearchPublicPropertyRequest
{
    /** Les clés de la liste qui ne règlent pas l'ensemble des biens comptés. */
    public const CLES_HORS_REPARTITION = [
        'price_min', 'price_max', 'sort', 'page', 'per_page', 'placements', 'seed_hour', 'published_after', 'facets',
    ];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            ...array_diff_key(parent::rules(), array_flip(self::CLES_HORS_REPARTITION)),
            'contract_type' => 'required|in:sale,rent',
        ];
    }

    /** @return array<string, mixed> */
    public function filtres(): array
    {
        return array_diff_key($this->validated(), array_flip(self::CLES_HORS_REPARTITION));
    }
}
