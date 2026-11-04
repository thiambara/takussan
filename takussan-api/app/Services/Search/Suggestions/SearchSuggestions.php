<?php

namespace App\Services\Search\Suggestions;

use App\Http\Requests\Search\SuggestRequest;
use App\Models\Property;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Search\PropertySearchService;
use App\Services\Search\Query\ParsedQuery;
use App\Services\Search\Query\SearchQueryParser;
use Meilisearch\Client;
use Meilisearch\Contracts\SearchQuery;
use Meilisearch\Exceptions\ApiException;

/**
 * TCK-2474 (ADR-0088) — ce que la barre de recherche montre à chaque frappe : la saisie comprise et son compte, les
 * complétions (recherches populaires et variantes), les lieux, et trois biens. **Un seul `/multi-search`** sur l'index
 * des suggestions ({@see SuggestionIndex}) et l'index des biens.
 *
 * - `interpretation` : présente quand {@see SearchQueryParser} comprend au moins un critère. `count` est le `totalHits`
 *   de la page 1 du régime nominal de la liste sous `criteria` + `q = residue` ({@see PropertySearchService::nominalQuery()}) :
 *   le total que `GET /api/public/properties/search` rendra sous ces paramètres. ⚠ Une seule exception, et elle est
 *   voulue : sous un résidu de plusieurs mots qui rend 0, la liste ÉLARGIT (ADR-0024) et son `meta.total` est celui de
 *   la recherche élargie ; la suggestion, elle, dit 0 — elle ne promet que le résultat exact.
 * - `parts` : valeurs et positions dans la saisie (`from`/`to` en caractères), **jamais de libellé** (principe n°5).
 * - `places` et `completions` : l'index des suggestions. Les lieux sont cherchés sur le texte encore incompris (le
 *   résidu : « appart 3ch alm » → Almadies), sinon sur le texte du lieu compris, sinon sur la saisie entière.
 * - `previews` : au plus 3 biens, ceux de la même requête que `count` (sans interprétation : la saisie en plein texte).
 * - **La base** (revue adverse n° 5, 2026-11-04) : les filtres de la liste que la navigation garde, validés comme la
 *   liste ({@see SuggestRequest::BASE_KEYS}). Un critère compris REMPLACE la même clé de la
 *   base, les autres clés de la base restent — sauf qu'une `city` comprise retire aussi `location` et `region` de la base
 *   (comme la navigation, TCK-439/635) ; `count` et `previews` portent la fusion, `criteria` la seule saisie.
 * - `interpretation.widens` : vrai si la liste ÉLARGIRA sous ces paramètres ({@see PropertySearchService::wouldWiden()},
 *   le même prédicat) — le front n'annonce « des biens proches » que dans ce cas (revue adverse n° 9).
 * - `popular` : à saisie vide seulement, les recherches populaires par poids.
 *
 * Tous les `count` sont des nombres de BIENS que la liste rend : en direct pour `interpretation`, au dernier passage de
 * `search:build-suggestions` (au plus une heure) pour les entrées de l'index.
 */
final class SearchSuggestions
{
    public const POPULAR_MAX = 6;

    public const PREVIEWS_MAX = 3;

    public const COMPLETIONS_MAX = 5;

    /**
     * Revue adverse n° 6 (2026-11-04) — la borne de `throttle:search-suggest`, par visiteur et par minute. La barre
     * suggère à chaque frappe : une saisie de 31 caractères coûte une trentaine d'appels, et 60/min coupait un visiteur
     * à sa deuxième saisie de la minute (derrière le NAT d'un opérateur mobile, des inconnus se partagent le seau). Une
     * réponse coûte 1 à 12 ms au p50 (mesuré le 2026-11-04) : 300 laisse une dizaine de saisies par minute.
     */
    public const RATE_PER_MINUTE = 300;

    private const RETRIEVED = ['kind', 'label_fr', 'label_en', 'label_wo', 'value', 'city', 'criteria', 'count'];

    public function __construct(
        private readonly Client $client,
        private readonly PropertySearchService $search,
        private readonly SearchQueryParser $parser,
    ) {}

    /**
     * @param  array<string, mixed>  $base  les filtres validés de la liste que la saisie ouvrira
     * @return array{interpretation: array<string, mixed>|null, completions: list<array<string, mixed>>, popular: list<array<string, mixed>>, places: list<array<string, mixed>>, previews: list<array<string, mixed>>}
     */
    public function resolve(string $q, int $limit, string $locale, array $base = []): array
    {
        $q = trim($q);
        $uid = SuggestionIndex::uid();

        if ($q === '') {
            $popular = (new SearchQuery)->setIndexUid($uid)->setQuery('')
                ->setFilter(["kind = '".SuggestionIndex::KIND_QUERY."'"])
                ->setSort(['weight:desc'])
                ->setLimit(self::POPULAR_MAX)
                ->setAttributesToRetrieve(self::RETRIEVED);
            [$results] = $this->multiSearch(['popular' => $popular]);

            return [
                'interpretation' => null,
                'completions' => [],
                'popular' => array_map(fn (array $hit): array => $this->completion($hit, $locale), $results['popular']['hits'] ?? []),
                'places' => [],
                'previews' => [],
            ];
        }

        $parsed = $this->parser->parse($q, $locale);
        // La fusion : la saisie remplace la même clé de la base, le reste de la base demeure. Comme la navigation
        // (TCK-439/635) : une ville comprise retire aussi le quartier et la région de la base.
        unset($base['q'], $base['search']);
        if ($parsed->understood && array_key_exists('city', $parsed->criteria)) {
            unset($base['location'], $base['region']);
        }
        $params = $parsed->understood
            ? [...$base, ...$parsed->criteria, 'q' => $parsed->residue ?? '']
            : [...$base, 'q' => $q];
        $placeText = $this->placeText($q, $parsed);

        $queries = [
            'completions' => (new SearchQuery)->setIndexUid($uid)->setQuery($q)
                ->setFilter(["kind IN ['".SuggestionIndex::KIND_QUERY."', '".SuggestionIndex::KIND_ALIAS."']"])
                ->setMatchingStrategy('all')
                ->setLimit(min($limit, self::COMPLETIONS_MAX))
                ->setAttributesToRetrieve(self::RETRIEVED),
        ];
        if ($placeText !== null) {
            $queries['places'] = (new SearchQuery)->setIndexUid($uid)->setQuery($placeText)
                ->setFilter(["kind IN ['".SuggestionIndex::KIND_CITY."', '".SuggestionIndex::KIND_NEIGHBORHOOD."']"])
                ->setMatchingStrategy('all')
                ->setLimit($limit)
                ->setAttributesToRetrieve(self::RETRIEVED);
        }
        $queries['properties'] = $this->search->nominalQuery($params, self::PREVIEWS_MAX);

        [$results, $suggestionsServed] = $this->multiSearch($queries);
        $properties = $results['properties'] ?? [];

        return [
            'interpretation' => $parsed->understood ? [
                'criteria' => $parsed->criteria,
                'parts' => array_map(static fn (array $part): array => [
                    'key' => $part['key'],
                    'value' => $part['value'],
                    'from' => $part['from'],
                    'to' => $part['to'],
                ], $parsed->parts),
                'residue' => $parsed->residue,
                'count' => (int) ($properties['totalHits'] ?? 0),
                // La liste élargira-t-elle sous ces paramètres (ADR-0024) ? Le prédicat même de la liste.
                'widens' => $this->search->wouldWiden($parsed->residue ?? '', (int) ($properties['totalHits'] ?? 0)),
            ] : null,
            'completions' => $suggestionsServed
                ? array_map(fn (array $hit): array => $this->completion($hit, $locale), $results['completions']['hits'] ?? [])
                : [],
            'popular' => [],
            'places' => $suggestionsServed
                ? array_map(static fn (array $hit): array => [
                    'kind' => (string) $hit['kind'],
                    'label' => (string) $hit['value'],
                    'city' => $hit['city'] ?? null,
                    'count' => (int) ($hit['count'] ?? 0),
                    'criteria' => self::criteria($hit),
                ], $results['places']['hits'] ?? [])
                : [],
            'previews' => $this->previews(array_map(static fn (array $hit): int => (int) $hit['id'], $properties['hits'] ?? [])),
        ];
    }

    /**
     * Le texte sur lequel chercher les lieux. La saisie entière ne convient pas : « appart 3ch almadies » ne porte
     * aucun lieu sur ses deux premiers mots, et sous `all` le moteur n'en rendrait aucun.
     */
    private function placeText(string $q, ParsedQuery $parsed): ?string
    {
        if (! $parsed->understood) {
            return $q;
        }
        if ($parsed->residue !== null) {
            return $parsed->residue;
        }
        foreach ($parsed->parts as $part) {
            if ($part['key'] === 'location' || $part['key'] === 'city') {
                return mb_substr($q, $part['from'], $part['to'] - $part['from']);
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $hit
     * @return array{text: string, criteria: array<string, mixed>|\stdClass, count: int}
     */
    private function completion(array $hit, string $locale): array
    {
        return [
            // Une variante (`alias`) propose le terme qu'elle désigne ; une recherche populaire, son texte.
            'text' => (string) ($hit['kind'] === SuggestionIndex::KIND_ALIAS ? $hit['value'] : ($hit['label_'.$locale] ?? $hit['label_fr'] ?? '')),
            'criteria' => self::criteria($hit),
            'count' => (int) ($hit['count'] ?? 0),
        ];
    }

    /**
     * Les critères d'une entrée, toujours en OBJET JSON : un tableau PHP vide s'écrirait `[]`, et le front attend `{}`.
     *
     * @param  array<string, mixed>  $hit
     * @return array<string, mixed>|\stdClass
     */
    private static function criteria(array $hit): array|\stdClass
    {
        $criteria = (array) ($hit['criteria'] ?? []);

        return $criteria === [] ? new \stdClass : $criteria;
    }

    /**
     * Le `/multi-search` unique. Si l'index des suggestions n'existe pas encore (avant le premier
     * `search:build-suggestions`), la requête des biens est rejouée seule : la barre montre la saisie comprise et ses
     * biens, sans complétions ni lieux, plutôt qu'une erreur.
     *
     * @param  array<string, SearchQuery>  $queries
     * @return array{0: array<string, array<string, mixed>>, 1: bool}
     */
    private function multiSearch(array $queries): array
    {
        try {
            return [$this->keyed($queries), true];
        } catch (ApiException $e) {
            if ($e->errorCode !== 'index_not_found' || ! str_contains((string) $e->getMessage(), SuggestionIndex::uid())) {
                throw $e;
            }
            $queries = array_filter($queries, static fn (SearchQuery $query): bool => ($query->toArray()['indexUid'] ?? null) !== SuggestionIndex::uid());

            return [$queries === [] ? [] : $this->keyed($queries), false];
        }
    }

    /**
     * @param  array<string, SearchQuery>  $queries
     * @return array<string, array<string, mixed>>
     */
    private function keyed(array $queries): array
    {
        /** @var array{results?: list<array<string, mixed>>} $response */
        $response = $this->client->multiSearch(array_values($queries));

        return array_combine(array_keys($queries), array_pad($response['results'] ?? [], count($queries), []));
    }

    /**
     * Les biens des identifiants rendus, dans leur ordre, rechargés sous `scopePublic()` (la même défense que
     * `PropertySearchService::hydrate()`). La photo : la première, par `PublicPhotoUrl::upTo()` — jamais l'original.
     *
     * @param  list<int>  $ids
     * @return list<array<string, mixed>>
     */
    private function previews(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $properties = Property::query()->public()->with(['address', 'media'])->whereIn('id', $ids)->get()->keyBy('id');

        $previews = [];
        foreach ($ids as $id) {
            $property = $properties->get($id);
            if ($property === null) {
                continue;
            }
            $photo = $property->getMedia('photos')->first();
            $previews[] = [
                'id' => $property->id,
                'slug' => $property->slug,
                'title' => $property->title,
                'price' => $property->price !== null ? (float) $property->price : null,
                'rent_period' => $property->rent_period?->value,
                'contract_type' => $property->contract_type?->value,
                'neighborhood' => $property->address?->neighborhood,
                'city' => $property->address?->city,
                'photo_url' => $photo === null ? null : PublicPhotoUrl::upTo($photo, 'thumbnail', fn (): bool => $property->requiresWatermark()),
            ];
        }

        return $previews;
    }
}
