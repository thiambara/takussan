<?php

namespace App\Services\Search;

use App\Http\Resources\PropertyResource;
use App\Http\Responses\PaginationMeta;
use App\Models\Property;
use Illuminate\Support\Carbon;

/**
 * Public property search, backed by Meilisearch (TCK-280).
 *
 * Issues a single Meilisearch query — filters, facets, geo and sort are all
 * pushed into the engine — so `meta.total` is the exact filtered count and no
 * post-engine filtering is needed. Returns the `{data, facets, meta}` contract
 * expected by `GET /api/public/properties/search`.
 */
class PropertySearchService
{
    /**
     * @param  array<string,mixed>  $params
     * @return array{data:array<int,mixed>,facets:array<string,mixed>,meta:array<string,int>}
     */
    public function search(array $params): array
    {
        $term = trim((string) ($params['q'] ?? $params['search'] ?? ''));
        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($params['per_page'] ?? 20)));

        $filter = $this->buildFilter($params);
        $sort = $this->buildSort((string) ($params['sort'] ?? 'relevance'), $term);

        // Scout unwraps a callback's SearchResult via getRaw(), so raw() here
        // yields the raw Meilisearch response array (hits/totalHits/etc.).
        /** @var array<string,mixed> $result */
        $result = Property::search($term, function ($index, string $query) use ($filter, $sort, $page, $perPage) {
            $searchParams = [
                'filter' => $filter,
                'facets' => ['neighborhood', 'bedrooms', 'type'],
                'page' => $page,
                'hitsPerPage' => $perPage,
            ];

            if ($sort !== []) {
                $searchParams['sort'] = $sort;
            }

            return $index->search($query, $searchParams);
        })->raw();

        return [
            'data' => $this->hydrate($result['hits'] ?? []),
            'facets' => $this->mapFacets($result['facetDistribution'] ?? []),
            // Meilisearch ne rend pas un paginateur Eloquent : c'est le seul appelant de
            // `PaginationMeta::of()`, l'entrée par compteurs bruts du point canonique (TCK-304).
            'meta' => PaginationMeta::of(
                total: (int) ($result['totalHits'] ?? 0),
                perPage: $perPage,
                currentPage: $page,
                lastPage: max(1, (int) ($result['totalPages'] ?? 1)),
            ),
        ];
    }

    /**
     * Les clauses moteur qui decrivent le CATALOGUE PUBLIC, et rien d'autre —
     * la transposition Meilisearch de `Property::scopePublic()`.
     *
     * TCK-335 — extraite parce qu'elle a un SECOND appelant : `SuggestService`
     * interroge desormais `POST /indexes/{uid}/facet-search` pour les villes et
     * les quartiers, et une facette comptee sous un filtre INCOMPLET rend un
     * compte faux. Mesure le 2026-08-21 sur la base locale (836 biens, 258
     * publics) : avec les trois premieres clauses seulement (visibility,
     * is_test, published_at) la facette rend « Mermoz 29 » et « Dakar 462 » ;
     * avec les quatre, « Mermoz 20 » et « Dakar 210 » — c'est-a-dire exactement
     * ce que `/search?location=Mermoz` et `/search?city=Dakar` totalisent.
     *
     * ⚠ Ne PAS recopier ces quatre lignes chez l'appelant : deux copies
     * divergent, et la divergence se lit comme un compte plausible.
     *
     * @return list<string>
     */
    public static function publicFilter(): array
    {
        return [
            "visibility = 'public'",
            'is_test = false',
            'published_at IS NOT NULL',
            'NOT status IN ['.self::quoteList(Property::NON_PUBLIC_STATUSES).']',
        ];
    }

    /**
     * Build the Meilisearch filter — outer array is AND-joined, a nested array
     * is OR-joined. The first clauses reproduce `Property::scopePublic()` so a
     * draft / non-public listing can never surface here.
     *
     * @param  array<string,mixed>  $p
     * @return array<int,string|array<int,string>>
     */
    private function buildFilter(array $p): array
    {
        $filter = self::publicFilter();

        if (! empty($p['location'])) {
            $filter[] = 'neighborhood = '.self::quote((string) $p['location']);
        }
        if (! empty($p['city'])) {
            $filter[] = 'city = '.self::quote((string) $p['city']);
        }
        if (isset($p['price_min']) && is_numeric($p['price_min'])) {
            $filter[] = 'price >= '.(float) $p['price_min'];
        }
        if (isset($p['price_max']) && is_numeric($p['price_max'])) {
            $filter[] = 'price <= '.(float) $p['price_max'];
        }
        if (isset($p['bedrooms']) && is_numeric($p['bedrooms'])) {
            $filter[] = 'bedrooms = '.(int) $p['bedrooms'];
        }
        if (isset($p['bathrooms']) && is_numeric($p['bathrooms'])) {
            $filter[] = 'bathrooms = '.(int) $p['bathrooms'];
        }
        // TCK-335 — `isset() && is_numeric()`, le motif de `price_min` juste au-dessus,
        // et surtout PAS `! empty()` : `area_min=0` doit AGIR (donc ecarter une surface
        // inconnue), pas etre relu comme « pas de filtre ».
        //
        // Et surtout PAS le motif OR `IS NULL` de la clause `available_from` plus bas :
        // `area` est nullable, et Meilisearch exclut nativement les NULL d'une
        // comparaison numerique. C'est le comportement voulu — un bien a surface
        // inconnue ne peut pas satisfaire « au moins 200 m² », on ne le promet pas.
        // C'est deja la regle de `floor_number` et de `price`, epinglee par
        // `PublicPropertySearchFiltersTest::test_floor_number_filter_excludes_null_floor`.
        if (isset($p['area_min']) && is_numeric($p['area_min'])) {
            $filter[] = 'area >= '.(float) $p['area_min'];
        }
        if (isset($p['area_max']) && is_numeric($p['area_max'])) {
            $filter[] = 'area <= '.(float) $p['area_max'];
        }
        // TCK-335 — UNILATERAL, par alignement sur `PublicPropertyController::index()`
        // qui traite deja ce parametre par `$request->boolean('featured')` sur la meme
        // surface publique. Deux endpoints qui portent le meme mot doivent rendre le
        // meme compte. L'interface n'offre qu'une bascule « en vedette uniquement » :
        // le « non-vedette » n'existe pas au produit.
        if (array_key_exists('featured', $p) && filter_var($p['featured'], FILTER_VALIDATE_BOOLEAN)) {
            $filter[] = 'featured = true';
        }
        if (isset($p['floor_number']) && is_numeric($p['floor_number'])) {
            $filter[] = 'floor_number = '.(int) $p['floor_number'];
        }
        if (! empty($p['type'])) {
            $types = array_filter(array_map('trim', explode(',', (string) $p['type'])));
            if ($types !== []) {
                $filter[] = array_map(fn ($t) => 'type = '.self::quote($t), array_values($types));
            }
        }
        if (! empty($p['contract_type'])) {
            $filter[] = 'contract_type = '.self::quote((string) $p['contract_type']);
        }
        if (! empty($p['rent_period'])) {
            $filter[] = 'rent_period = '.self::quote((string) $p['rent_period']);
        }
        if (array_key_exists('furnished', $p) && $p['furnished'] !== null && $p['furnished'] !== '') {
            $filter[] = 'furnished = '.(filter_var($p['furnished'], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false');
        }
        if (! empty($p['tags'])) {
            $tags = is_array($p['tags']) ? $p['tags'] : explode(',', (string) $p['tags']);
            $tags = array_filter(array_map('trim', $tags));
            if ($tags !== []) {
                $filter[] = array_map(fn ($t) => 'tags = '.self::quote($t), array_values($tags));
            }
        }
        if (! empty($p['available_from'])) {
            $ts = Carbon::parse($p['available_from'])->timestamp;
            $filter[] = ['available_from IS NULL', 'available_from <= '.$ts];
        }
        if ($this->hasGeoBounds($p)) {
            $filter[] = sprintf(
                '_geoBoundingBox([%F, %F], [%F, %F])',
                (float) $p['lat_max'], (float) $p['lng_max'],
                (float) $p['lat_min'], (float) $p['lng_min'],
            );
        }

        return $filter;
    }

    /**
     * @return array<int,string>
     */
    private function buildSort(string $sort, string $term): array
    {
        return match ($sort) {
            'price_asc' => ['price:asc'],
            'price_desc' => ['price:desc'],
            'created_desc' => ['created_at:desc'],
            default => $term === '' ? ['featured:desc', 'published_at:desc'] : [],
        };
    }

    /**
     * Load full models for the hit ids, preserving Meilisearch's order.
     *
     * @param  array<int,array<string,mixed>>  $hits
     * @return array<int,mixed>
     */
    private function hydrate(array $hits): array
    {
        $ids = array_map(static fn (array $hit): int => (int) $hit['id'], $hits);

        if ($ids === []) {
            return [];
        }

        // Re-apply scopePublic() on hydration as defense-in-depth: the engine
        // filter in buildFilter() already excludes non-public / is_test rows,
        // but enforcing it again at the DB layer guarantees a draft, sold or
        // test fixture can never leak even if the index is stale or the Scout
        // engine ignores the raw filter (e.g. the database driver in tests).
        $properties = Property::query()
            ->public()
            ->with('address', 'media')
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        $ordered = collect($ids)
            ->map(static fn (int $id) => $properties->get($id))
            ->filter()
            ->values();

        return PropertyResource::collection($ordered)->resolve();
    }

    /**
     * @param  array<string,array<string,int>>  $distribution
     * @return array<string,array<string,int>>
     */
    private function mapFacets(array $distribution): array
    {
        return [
            'locations' => $distribution['neighborhood'] ?? [],
            'bedrooms' => $distribution['bedrooms'] ?? [],
            'types' => $distribution['type'] ?? [],
        ];
    }

    /**
     * @param  array<string,mixed>  $p
     */
    private function hasGeoBounds(array $p): bool
    {
        foreach (['lat_min', 'lat_max', 'lng_min', 'lng_max'] as $key) {
            if (! isset($p[$key]) || ! is_numeric($p[$key])) {
                return false;
            }
        }

        return true;
    }

    private static function quote(string $value): string
    {
        return "'".str_replace(['\\', "'"], ['\\\\', "\\'"], $value)."'";
    }

    /**
     * @param  array<int,string>  $values
     */
    private static function quoteList(array $values): string
    {
        return implode(', ', array_map(fn (string $v): string => self::quote($v), $values));
    }
}
