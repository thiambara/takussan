<?php

namespace App\Services\Search\Suggestions;

use App\Http\Requests\Search\SuggestRequest;
use App\Models\Property;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Search\PropertySearchService;
use App\Services\Search\Query\InMemoryPlaceLexicon;
use App\Services\Search\Query\ParsedQuery;
use App\Services\Search\Query\SearchQueryParser;
use App\Support\Search\CleDeQuartier;
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
 * - `places` et `completions` : l'index des suggestions. Les lieux sont cherchés sur le texte du lieu compris, sinon
 *   sur le texte encore incompris (le résidu : « appart 3ch alm » → Almadies), sinon sur la saisie entière.
 * - `previews` : au plus 3 biens, ceux de la même requête que `count` (sans interprétation : la saisie en plein texte).
 * - **La base** (revue adverse n° 5, 2026-11-04) : les filtres de la liste que la navigation garde, validés comme la
 *   liste ({@see SuggestRequest::BASE_KEYS}). Un critère compris REMPLACE la même clé de la
 *   base, les autres clés de la base restent — sauf qu'une `city` comprise retire aussi `location`, `region` et `cities` de la base
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

    /** TCK-2496 — les critères à retirer rendus, au plus. */
    public const RELAXATIONS_MAX = 3;

    /** TCK-2496 — les sondes de `relaxations`, au plus : une par critère compris (et le texte), dans un seul `/multi-search`. */
    public const RELAXATIONS_PROBES_MAX = 8;

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
        unset($base['q'], $base['search']);
        $params = $parsed->understood ? $this->params($base, $parsed->criteria, $parsed->residue) : $this->params($base, [], $q);
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

        // TCK-2496 — un lieu mal écrit (« mermos ») que les lieux ont trouvé sans ambiguïté devient le critère de lieu.
        // Une seconde requête, celle des biens seule, et seulement dans ce cas : le compte et les aperçus suivent la
        // saisie corrigée.
        $corrige = $suggestionsServed ? $this->lieuMalEcrit($q, $locale, $parsed, $results['places']['hits'] ?? []) : null;
        if ($corrige !== null) {
            $parsed = $corrige;
            $params = $this->params($base, $parsed->criteria, $parsed->residue);
            [$recompte] = $this->multiSearch(['properties' => $this->search->nominalQuery($params, self::PREVIEWS_MAX)]);
            $properties = $recompte['properties'] ?? [];
        }
        $count = (int) ($properties['totalHits'] ?? 0);

        $interpretation = null;
        if ($parsed->understood) {
            $interpretation = [
                'criteria' => $parsed->criteria,
                'parts' => array_map(static fn (array $part): array => [
                    'key' => $part['key'],
                    'value' => $part['value'],
                    'from' => $part['from'],
                    'to' => $part['to'],
                ], $parsed->parts),
                'residue' => $parsed->residue,
                'count' => $count,
                // La liste élargira-t-elle sous ces paramètres (ADR-0024) ? Le prédicat même de la liste.
                'widens' => $this->search->wouldWiden($parsed->residue ?? '', $count),
            ];
            // TCK-2496 — sans bien exact, les critères dont le retrait rend des biens. Jamais sous un compte non nul.
            if ($count === 0) {
                $interpretation['relaxations'] = $this->relaxations($base, $parsed);
            }
        }

        return [
            'interpretation' => $interpretation,
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
     * Les paramètres de la liste sous lesquels la saisie se compte. La fusion : la saisie remplace la même clé de la base,
     * le reste de la base demeure. Comme la navigation (TCK-439/635) : une ville comprise retire aussi le quartier, la
     * région et les villes du profil (`cities`, en OU) de la base — gardées, elles s'ajouteraient en ET à la ville comprise
     * (« dakar » sur `cities=Thiès` : 0 bien).
     *
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $criteria
     * @return array<string, mixed>
     */
    private function params(array $base, array $criteria, ?string $texte): array
    {
        if (array_key_exists('city', $criteria)) {
            unset($base['location'], $base['region'], $base['cities']);
        }

        return [...$base, ...$criteria, 'q' => $texte ?? ''];
    }

    /**
     * TCK-2496 — la saisie relue avec un lieu mal écrit, ou `null`.
     *
     * Le lieu vient des `places` que la même frappe a déjà rendues (l'index des suggestions tolère la faute) ; il n'est
     * repris que si la saisie n'a compris aucun lieu et que les lieux ont été cherchés sur le texte incompris (le résidu,
     * ou la saisie entière). Chaque lieu rendu est comparé à chaque suite de mots du texte incompris, de même longueur que
     * son nom, par la distance du parseur ; une suite faite de mots courants (« grand standing », « vue ») n'est jamais
     * un lieu. Retenu : le lieu le plus proche, dans la tolérance de l'index des suggestions (une faute dès
     * `oneTypo`, deux dès `twoTypos` caractères), et SEUL à cette distance — deux lieux aussi proches de la faute, et
     * rien n'est deviné (une ville et un quartier du même nom : la ville, l'arbitrage du lexique). Un début de lieu
     * (« alma ») est trop loin du nom entier pour être retenu : il reste proposé dans `places`.
     *
     * La saisie est alors RELUE par le parseur, ce lieu en plus ({@see SearchQueryParser::withPlaces()}) : mots de liaison,
     * résidu et positions (`from`/`to` de la part, sur « mermos ») sont ceux d'un lieu connu.
     *
     * @param  list<array<string, mixed>>  $hits
     */
    private function lieuMalEcrit(string $q, string $locale, ParsedQuery $parsed, array $hits): ?ParsedQuery
    {
        if (array_key_exists('location', $parsed->criteria) || array_key_exists('city', $parsed->criteria)) {
            return null;
        }
        $texte = CleDeQuartier::de($parsed->understood ? $parsed->residue : $q);
        if ($texte === null || $hits === []) {
            return null;
        }
        $mots = explode(' ', $texte);
        ['oneTypo' => $uneFaute, 'twoTypos' => $deuxFautes] = SuggestionIndex::settings()['typoTolerance']['minWordSizeForTypos'];

        /** @var array<string, array{distance: int, tape: string, hit: array<string, mixed>}> $proches */
        $proches = [];
        foreach ($hits as $hit) {
            $nom = CleDeQuartier::de(is_string($hit['value'] ?? null) ? $hit['value'] : null);
            if ($nom === null || ! in_array($hit['kind'] ?? null, [SuggestionIndex::KIND_CITY, SuggestionIndex::KIND_NEIGHBORHOOD], true)) {
                continue;
            }
            $n = count(explode(' ', $nom));
            for ($debut = 0; $debut + $n <= count($mots); $debut++) {
                $fenetre = array_slice($mots, $debut, $n);
                if (array_filter($fenetre, static fn (string $mot): bool => ! SearchQueryParser::isCommonWord($mot)) === []) {
                    continue;
                }
                $tape = implode(' ', $fenetre);
                $longueur = strlen(str_replace(' ', '', $tape));
                $budget = $longueur >= $deuxFautes ? 2 : ($longueur >= $uneFaute ? 1 : 0);
                $distance = SearchQueryParser::distance($tape, $nom);
                $cle = $hit['kind']."\0".$hit['value']."\0".($hit['city'] ?? '');
                if ($distance <= $budget && (! isset($proches[$cle]) || $distance < $proches[$cle]['distance'])) {
                    $proches[$cle] = ['distance' => $distance, 'tape' => $tape, 'hit' => $hit];
                }
            }
        }
        if ($proches === []) {
            return null;
        }

        $min = min(array_column($proches, 'distance'));
        $retenus = array_values(array_filter($proches, static fn (array $p): bool => $p['distance'] === $min));
        if (count($retenus) > 1) {
            $villes = array_values(array_filter($retenus, static fn (array $p): bool => $p['hit']['kind'] === SuggestionIndex::KIND_CITY));
            $noms = array_unique(array_map(static fn (array $p): ?string => CleDeQuartier::de((string) $p['hit']['value']), $retenus));
            if (count($villes) !== 1 || count($noms) !== 1) {
                return null;
            }
            $retenus = $villes;
        }

        $hit = $retenus[0]['hit'];
        $ville = $hit['kind'] === SuggestionIndex::KIND_CITY;
        $relu = $this->parser->withPlaces(new InMemoryPlaceLexicon([[
            'kind' => $ville ? 'city' : 'neighborhood',
            'name' => (string) $hit['value'],
            'city' => $ville ? null : (isset($hit['city']) ? (string) $hit['city'] : null),
            'spelling' => $retenus[0]['tape'],
        ]]))->parse($q, $locale);

        // Relue, la saisie doit porter CE lieu (un second lieu ou un contrat contradictoire retourne au résidu).
        return ($relu->criteria[$ville ? 'city' : 'location'] ?? null) === $hit['value'] ? $relu : null;
    }

    /**
     * TCK-2496 — sous un compte nul, les critères de la saisie dont le retrait rend des biens : `{key, count}`, au plus
     * {@see self::RELAXATIONS_MAX}, du plus grand compte au plus petit. `key` est le paramètre de la liste (`type`,
     * `location`…) ou `q` pour le texte incompris.
     *
     * Chaque compte est celui de la liste sous la même base que `count`, la clé retirée de la saisie — la valeur de la
     * base pour cette clé revient alors, comme dans la navigation. La ville déduite d'un quartier n'est pas une clé
     * (rien ne l'a écrite) : retirer le quartier garde la ville. Le coût est borné : un seul `/multi-search`, une sonde
     * sans document (`hitsPerPage: 0`) par clé, au plus {@see self::RELAXATIONS_PROBES_MAX} sondes.
     *
     * @param  array<string, mixed>  $base
     * @return list<array{key: string, count: int}>
     */
    private function relaxations(array $base, ParsedQuery $parsed): array
    {
        $cles = array_values(array_unique(array_column($parsed->parts, 'key')));
        if ($parsed->residue !== null) {
            $cles[] = 'q';
        }

        $queries = [];
        foreach (array_slice($cles, 0, self::RELAXATIONS_PROBES_MAX) as $cle) {
            $criteria = $parsed->criteria;
            if ($cle !== 'q') {
                unset($criteria[$cle]);
            }
            $params = $this->params($base, $criteria, $cle === 'q' ? null : $parsed->residue);
            $queries[$cle] = $this->search->nominalQuery($params, 0);
        }
        if ($queries === []) {
            return [];
        }

        [$results] = $this->multiSearch($queries);
        $relaxations = [];
        foreach (array_keys($queries) as $cle) {
            $total = (int) ($results[$cle]['totalHits'] ?? 0);
            if ($total > 0) {
                $relaxations[] = ['key' => (string) $cle, 'count' => $total];
            }
        }
        usort($relaxations, static fn (array $a, array $b): int => $b['count'] <=> $a['count']);

        return array_slice($relaxations, 0, self::RELAXATIONS_MAX);
    }

    /**
     * Le texte sur lequel chercher les lieux. La saisie entière ne convient pas : « appart 3ch almadies » ne porte
     * aucun lieu sur ses deux premiers mots, et sous `all` le moteur n'en rendrait aucun.
     *
     * Un lieu compris l'emporte sur le résidu (revue de code du 2026-11-04) : « appart almadies vue » se lit
     * location=Almadies, résidu « vue », et sous `all` « vue » ne rend aucun lieu — Almadies manquait. Le quartier
     * d'abord, plus précis que la ville (« Médina Saint-Louis »). Le résidu ne sert que sans lieu compris : c'est le
     * lieu que l'on est en train d'écrire (« appart 3ch alm » → Almadies).
     */
    private function placeText(string $q, ParsedQuery $parsed): ?string
    {
        if (! $parsed->understood) {
            return $q;
        }
        foreach (['location', 'city'] as $key) {
            foreach ($parsed->parts as $part) {
                if ($part['key'] === $key) {
                    return mb_substr($q, $part['from'], $part['to'] - $part['from']);
                }
            }
        }

        return $parsed->residue;
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
