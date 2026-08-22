<?php

namespace App\Services\Search;

use App\Http\Resources\PropertyResource;
use App\Http\Responses\PaginationMeta;
use App\Models\Property;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Laravel\Scout\EngineManager;
use Meilisearch\Contracts\SearchQuery;

/**
 * Public property search, backed by Meilisearch (TCK-280).
 *
 * Issues a single Meilisearch query — filters, facets, geo and sort are all
 * pushed into the engine — so `meta.total` is the exact filtered count and no
 * post-engine filtering is needed. Returns the `{data, facets, meta, search}`
 * contract expected by `GET /api/public/properties/search`.
 *
 * ── DEUX RÉGIMES (TCK-338, {@see docs/adr/0024-recherche-publique-conjonctive-avec-repli-nomme.md}) ──
 *
 * 1. NOMINAL — `matchingStrategy: 'all'` : un bien ne sort que s'il porte TOUS
 *    les termes utiles. Une requête, comme avant.
 * 2. REPLI — quand le nominal rend 0 ET que la requête porte ≥ 2 termes utiles :
 *    UN SEUL `/multi-search` rejoue la requête en `last` et SONDE chaque terme
 *    seul. La réponse porte alors `search.strategy = 'widened'` et nomme les
 *    termes dont la sonde solo rend 0.
 *
 * Mesuré le 2026-08-21 (base locale, 258 biens publics), et c'est le défaut qui
 * a ouvert le ticket : sous le défaut `last` de Meilisearch, `q=villa Saly`
 * rendait EXACTEMENT les 63 mêmes ids que `q=villa`, dans le même ordre — le
 * moteur retire les termes qui ne matchent pas au lieu d'exclure les documents.
 * Sous `all` : 0, et `villa Dakar` rend 47, c'est-à-dire exactement ce que rend
 * `q=villa&city=Dakar` (6 couples comparés, 6 coïncidences).
 *
 * ⚠ Le repli n'est PAS un ornement. `all` est brutal sur un catalogue mince :
 * 30 couples (type × ville) sur 60 tombent à 0, et une faute sur un mot court
 * (`villa dakr`) fait 63 → 0 sans dégradation, `dakr` étant sous le seuil
 * `typoTolerance.minWordSizeForTypos.oneTypo = 5`. Retirer le repli en gardant
 * `all` serait une régression produit.
 */
class PropertySearchService
{
    /** Régime nominal : le document doit porter TOUS les termes. */
    private const STRATEGY_STRICT = 'all';

    /** Régime de repli : Meilisearch relâche les termes par la fin. */
    private const STRATEGY_WIDENED = 'last';

    /**
     * Plafond de sondes par requête.
     *
     * Une sonde par terme utile, dans le MÊME `/multi-search` que la requête
     * élargie — mesuré 6 à 30 ms pour 2 à 4 termes. Le plafond borne le coût
     * d'une requête pathologique (une phrase entière collée dans la barre) ; les
     * termes au-delà ne sont pas sondés, donc jamais nommés. C'est le sens
     * exact de la règle : on ne nomme pas un terme qu'on n'a pas sondé.
     */
    private const MAX_PROBES = 8;

    /** @var list<string> */
    private const FACETS = ['neighborhood', 'bedrooms', 'type'];

    /**
     * @param  array<string,mixed>  $params
     * @return array{data:array<int,mixed>,facets:array<string,mixed>,meta:array<string,int>,search:array{strategy:string,terms_unmatched:list<string>,widened_total:int|null}}
     */
    public function search(array $params): array
    {
        $term = trim((string) ($params['q'] ?? $params['search'] ?? ''));
        $page = max(1, (int) ($params['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($params['per_page'] ?? 20)));

        $filter = $this->buildFilter($params);
        $sort = $this->buildSort((string) ($params['sort'] ?? 'relevance'), $term, $params);

        // Scout unwraps a callback's SearchResult via getRaw(), so raw() here
        // yields the raw Meilisearch response array (hits/totalHits/etc.).
        /** @var array<string,mixed> $result */
        $result = Property::search($term, function ($index, string $query) use ($filter, $sort, $page, $perPage) {
            $searchParams = [
                'filter' => $filter,
                'facets' => self::FACETS,
                'page' => $page,
                'hitsPerPage' => $perPage,
                // TCK-338 — LA ligne de la décision. Paramètre de REQUÊTE, pas
                // réglage d'index : sa portée s'arrête à cet appelant, et la
                // révoquer ne demande aucune réindexation. C'est aussi ce qui la
                // rend facile à défaire par accident — chaque test qui en dépend
                // a donc été vérifié par ablation de cette ligne précise.
                'matchingStrategy' => self::STRATEGY_STRICT,
            ];

            if ($sort !== []) {
                $searchParams['sort'] = $sort;
            }

            return $index->search($query, $searchParams);
        })->raw();

        $search = [
            'strategy' => self::STRATEGY_STRICT,
            'terms_unmatched' => [],
            'widened_total' => null,
        ];

        // Le repli ne coûte QUE sur une requête qui rend 0 : le chemin nominal
        // reste à une seule requête moteur.
        $useful = $this->usefulTerms($term);

        if ((int) ($result['totalHits'] ?? 0) === 0 && count($useful) >= 2) {
            $widened = $this->widen($term, $useful, $filter, $sort, $page, $perPage);

            if ($widened !== null) {
                [$result, $unmatched] = $widened;
                $search = [
                    'strategy' => 'widened',
                    'terms_unmatched' => $unmatched,
                    // Écho de `meta.total`, par construction : `data`, `facets`
                    // et `meta` décrivent TOUS le résultat élargi. Ce champ
                    // existe pour que le message du front ne dépende pas de la
                    // lecture de la pagination, jamais pour porter un compte que
                    // `meta` contredirait.
                    'widened_total' => (int) ($result['totalHits'] ?? 0),
                ];
            }
        }

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
            'search' => $search,
        ];
    }

    /**
     * Le repli, en UN SEUL aller-retour : la requête élargie ET les sondes.
     *
     * Position 0 du `/multi-search` : la requête complète rejouée en `last`,
     * avec la MÊME pagination, le MÊME tri, les MÊMES facettes et le MÊME filtre
     * que le régime nominal — c'est elle qui devient `data`/`facets`/`meta`.
     * Positions 1..n : une sonde par terme utile, `all`, `hitsPerPage: 0` (le
     * moteur rend `totalHits` sans rendre un seul document).
     *
     * ⚠ Les sondes portent le filtre STRUCTURÉ de la requête, pas seulement le
     * filtre public. Sous `filter[city]=Dakar`, « aucun bien ne correspond à
     * *Saly* » parle du catalogue de Dakar — celui que l'utilisateur regarde.
     * Une sonde jouée hors contexte rendrait une phrase vraie ailleurs.
     *
     * ⚠⚠ Ce que Meilisearch NE PERMET PAS, et qui a fait réécrire la
     * prescription du ticket : le moteur ne rend nulle part les termes qu'il a
     * relâchés, et sous `last` il n'existe pas d'ensemble global — seul le
     * PREMIER terme est obligatoire, document par document. La seule chose
     * calculable, donc la seule qu'on affirme, est « ce terme, seul, ne rend
     * rien ».
     *
     * @param  list<string>  $useful
     * @param  array<int,string|array<int,string>>  $filter
     * @param  array<int,string>  $sort
     * @return array{0:array<string,mixed>,1:list<string>}|null null si le moteur n'a pas
     *                                                          rendu le compte de réponses
     *                                                          attendu : on garde alors la
     *                                                          réponse conjonctive plutôt que
     *                                                          d'inventer un repli.
     */
    private function widen(string $term, array $useful, array $filter, array $sort, int $page, int $perPage): ?array
    {
        $uid = (new Property)->searchableAs();
        $probed = array_slice($useful, 0, self::MAX_PROBES);

        $widened = (new SearchQuery)
            ->setIndexUid($uid)
            ->setQuery($term)
            ->setMatchingStrategy(self::STRATEGY_WIDENED)
            ->setFilter($filter)
            ->setFacets(self::FACETS)
            ->setPage($page)
            ->setHitsPerPage($perPage);

        if ($sort !== []) {
            $widened->setSort($sort);
        }

        $queries = [$widened];

        foreach ($probed as $mot) {
            $queries[] = (new SearchQuery)
                ->setIndexUid($uid)
                ->setQuery($mot)
                ->setMatchingStrategy(self::STRATEGY_STRICT)
                ->setFilter($filter)
                ->setPage(1)
                ->setHitsPerPage(0);
        }

        // Le moteur CONFIGURÉ, jamais `engine('meilisearch')` en dur : le même
        // que celui par lequel Scout sert le régime nominal, donc le même
        // préfixe d'index — y compris celui, par exécution, que le harnais de
        // tests pose dans `SCOUT_PREFIX`. Même motif que `SuggestService`.
        /** @var array{results?: array<int, array<string,mixed>>} $response */
        $response = app(EngineManager::class)->engine()->multiSearch($queries);
        $results = $response['results'] ?? [];

        if (count($results) !== count($queries)) {
            return null;
        }

        $unmatched = [];
        foreach ($probed as $i => $mot) {
            if ((int) ($results[$i + 1]['totalHits'] ?? 0) === 0) {
                $unmatched[] = $mot;
            }
        }

        return [$results[0], $unmatched];
    }

    /**
     * Les termes que le MOTEUR va réellement exiger — pas les mots de la saisie.
     *
     * Trois écarts entre les deux, et chacun produirait une phrase fausse s'il
     * était ignoré :
     *
     * 1. **Les mots vides.** Meilisearch les retire à la requête comme à
     *    l'indexation. Sonder « a » dans « villa a louer » nommerait un terme
     *    que le moteur n'a jamais exigé. La liste est LUE dans `config/scout.php`
     *    (TCK-335), jamais recopiée : deux copies divergent, et la divergence se
     *    lit comme un compte plausible.
     * 2. **La ponctuation.** « villa, Saly » porte deux termes, pas un.
     * 3. **Les doublons.** « villa villa » est une requête à UN terme utile ;
     *    la traiter comme deux déclencherait un repli sur une conjonction
     *    triviale.
     *
     * Le pliage d'accents suit celui de Meilisearch, qui normalise le jeton
     * avant de le comparer à la liste — c'est ainsi que « À vendre » et
     * « a vendre » se réduisent au même terme utile unique. La casse et
     * l'orthographe D'ORIGINE sont conservées dans la valeur rendue : c'est
     * celle-là que le front affichera à l'utilisateur.
     *
     * @return list<string>
     */
    private function usefulTerms(string $term): array
    {
        if ($term === '') {
            return [];
        }

        $stopWords = $this->stopWords();
        $mots = preg_split('/[^\p{L}\p{N}]+/u', $term, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        $useful = [];
        foreach ($mots as $mot) {
            $cle = $this->fold($mot);

            if ($cle === '' || isset($useful[$cle]) || in_array($cle, $stopWords, true)) {
                continue;
            }

            $useful[$cle] = $mot;
        }

        return array_values($useful);
    }

    /**
     * Les mots vides de l'index `properties`, DÉRIVÉS de `config/scout.php`.
     *
     * Repliés comme les jetons qu'on leur comparera, une fois : la liste porte
     * « a » ET « à », et le repliage rend la comparaison indépendante de ce
     * choix d'écriture.
     *
     * @return list<string>
     */
    private function stopWords(): array
    {
        /** @var array<class-string,array<string,mixed>> $settings */
        $settings = (array) config('scout.meilisearch.index-settings', []);
        /** @var array<int,string> $mots */
        $mots = (array) ($settings[Property::class]['stopWords'] ?? []);

        return array_values(array_unique(array_map(fn (string $m): string => $this->fold($m), $mots)));
    }

    /** Minuscule + accents pliés — la normalisation sous laquelle on compare. */
    private function fold(string $value): string
    {
        return Str::ascii(Str::lower($value));
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
        // TCK-346 / ADR-0023 — le rayon, en MÈTRES pour le moteur.
        //
        // ⚠ C'est LA seule conversion km → m du dépôt : le paramètre public est
        // `radius_km`, `_geoRadius` prend des mètres, et la frontière est ici.
        // Le rayon et le rectangle ci-dessus sont CONJOINTS (`$filter` est un ET
        // de ses éléments) : envoyer les deux rend l'intersection, ce qui est le
        // sens attendu d'« un rayon, dans le cadrage que je regarde ».
        //
        // Un bien sans coordonnées n'a pas de `_geo` dans son document
        // (`Property::toSearchableArray()` ne l'émet que si l'adresse porte les
        // deux colonnes) : il ne satisfait donc AUCUN `_geoRadius`. C'est voulu,
        // et c'est la règle déjà appliquée à `area` et `price` — on ne promet
        // pas ce qu'on ne sait pas.
        if ($this->hasGeoRadius($p)) {
            $filter[] = sprintf(
                '_geoRadius(%F, %F, %F)',
                (float) $p['lat'], (float) $p['lng'],
                (float) $p['radius_km'] * 1000,
            );
        }

        return $filter;
    }

    /**
     * TCK-346 / ADR-0023 — `distance` demande à Meilisearch de classer par
     * éloignement au point donné, du plus proche au plus lointain.
     *
     * ⚠ C'est `_geo` — PAS `_geoPoint` — qui doit figurer dans
     * `sortableAttributes` (config/scout.php) : le moteur résout l'expression
     * de tri vers l'attribut `_geo` et vérifie celui-là. Mesuré sur
     * Meilisearch 1.16 le 2026-08-22, le détail est dans `config/scout.php`.
     * Sans ce réglage le moteur REFUSE la requête (HTTP 400), il ne dégrade pas
     * le tri. C'est un réglage d'INDEX, donc un `scout:sync-index-settings` au
     * déploiement.
     *
     * ⚠⚠ Le repli `[]` sur `distance` sans point est INATTEIGNABLE par HTTP :
     * `SearchPublicPropertyRequest` rend 422 (`sort_distance_requires_point`).
     * Il existe pour qu'un appel direct au service — un job, un test — ne
     * produise pas une erreur moteur ; il n'est pas le contrat.
     *
     * @param  array<string,mixed>  $p
     * @return array<int,string>
     */
    private function buildSort(string $sort, string $term, array $p = []): array
    {
        return match ($sort) {
            'price_asc' => ['price:asc'],
            'price_desc' => ['price:desc'],
            'created_desc' => ['created_at:desc'],
            'distance' => $this->hasGeoPoint($p)
                ? [sprintf('_geoPoint(%F,%F):asc', (float) $p['lat'], (float) $p['lng'])]
                : [],
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

    /**
     * Un point d'origine complet et exploitable.
     *
     * @param  array<string,mixed>  $p
     */
    private function hasGeoPoint(array $p): bool
    {
        return isset($p['lat'], $p['lng']) && is_numeric($p['lat']) && is_numeric($p['lng']);
    }

    /**
     * Un point ET un rayon strictement positif.
     *
     * ⚠ `is_numeric` plutôt que `! empty` : `empty('0')` est vrai, et
     * `lat = 0` est une latitude parfaitement valide. Le chemin haversine
     * (`App\Services\Model\SearchService`) emploie `! empty` et perd donc
     * silencieusement un point sur l'équateur — c'est un des deux défauts que
     * TCK-346 a relevés sur lui.
     *
     * @param  array<string,mixed>  $p
     */
    private function hasGeoRadius(array $p): bool
    {
        return $this->hasGeoPoint($p)
            && isset($p['radius_km'])
            && is_numeric($p['radius_km'])
            && (float) $p['radius_km'] > 0;
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
