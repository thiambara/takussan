<?php

namespace App\Services\Search\Suggestions;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Services\Search\PropertySearchService;
use App\Services\Search\Query\DatabasePlaceLexicon;
use App\Services\Search\SearchJournal;
use App\Support\Search\CleDeQuartier;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Meilisearch\Client;
use Meilisearch\Contracts\IndexesQuery;
use Meilisearch\Contracts\SearchQuery;
use Meilisearch\Exceptions\ApiException;
use RuntimeException;
use Throwable;

/**
 * TCK-2474 (ADR-0088) — construit l'index des suggestions ({@see SuggestionIndex}) et le met en service d'un coup.
 *
 * **Jamais d'index à moitié rempli servi** : tout est écrit dans un index neuf (`<uid>_build_<aléa>`, réglages posés
 * AVANT les documents), puis échangé avec l'index servi par `/swap-indexes` — une opération atomique du moteur — et
 * l'ancien contenu, désormais sous le nom temporaire, est supprimé. Une construction qui échoue en route laisse l'index
 * servi tel qu'il était.
 *
 * **Idempotente** : elle relit tout à chaque fois (catalogue public, journal, référentiel) et remplace l'index entier ;
 * deux exécutions de suite rendent le même index. Deux exécutions SIMULTANÉES écrivent deux index temporaires
 * distincts et échangent chacune le sien : le dernier échange gagne, tous deux complets.
 *
 * **Les comptes sont ceux de la liste** : chaque lieu, type et recherche populaire est compté par une requête
 * `PropertySearchService::nominalQuery()` sous ses critères — la traduction des critères en filtre de `/search`,
 * empruntée, jamais recopiée —, groupées par `/multi-search`. Une entrée à zéro bien n'entre pas dans l'index.
 */
final class SuggestionIndexBuilder
{
    /** Recherches populaires lues dans le journal (déjà filtrées par ADR-0088 : ≥ 5 visiteurs un même jour, > 0). */
    private const POPULAR_MAX = 500;

    /** Requêtes de compte par `/multi-search`. */
    private const COUNT_BATCH = 100;

    private const DOCUMENT_BATCH = 1000;

    private const TASK_TIMEOUT_MS = 120_000;

    /** Un index de construction plus vieux n'appartient plus à une construction vivante. */
    private const STALE_BUILD_SECONDS = 3600;

    public function __construct(
        private readonly Client $client,
        private readonly PropertySearchService $search,
        private readonly SearchJournal $journal,
        private readonly DatabasePlaceLexicon $lexicon,
    ) {}

    /**
     * @return array{uid: string, documents: int, kinds: array<string, int>}
     */
    public function build(): array
    {
        $documents = $this->documents();

        $live = SuggestionIndex::uid();
        $build = $live.SuggestionIndex::BUILD_MARKER.bin2hex(random_bytes(4));

        $this->wait($this->client->createIndex($build, ['primaryKey' => 'id']));

        try {
            $index = $this->client->index($build);
            $this->wait($index->updateSettings(SuggestionIndex::settings()));
            foreach (array_chunk($documents, self::DOCUMENT_BATCH) as $chunk) {
                $this->wait($index->addDocuments($chunk));
            }

            // Le premier échange : `/swap-indexes` exige les deux index. L'index servi naît vide et n'est vide que le
            // temps de l'échange qui suit ; avant, la route servait déjà « aucun index » (cf. SearchSuggestions).
            if (! $this->exists($live)) {
                $this->wait($this->client->createIndex($live, ['primaryKey' => 'id']));
            }
            $this->wait($this->client->swapIndexes([[$live, $build]]));
        } finally {
            // Après l'échange, c'est l'ANCIEN contenu ; avant (échec), l'index inachevé. Dans les deux cas : à jeter.
            try {
                $this->client->deleteIndex($build);
            } catch (Throwable) {
                // balayé par la construction suivante (sweepStaleBuilds)
            }
        }

        $this->sweepStaleBuilds($live);

        $kinds = array_count_values(array_column($documents, 'kind'));
        ksort($kinds);

        return ['uid' => $live, 'documents' => count($documents), 'kinds' => $kinds];
    }

    /** @return list<array<string, mixed>> */
    public function documents(): array
    {
        $candidates = [
            ...$this->places(),
            ...$this->propertyTypes(),
            ...$this->popularQueries(),
        ];
        $candidates = $this->withAliases($candidates);

        $counts = $this->counts(array_map(static fn (array $doc): array => $doc['_params'], $candidates));

        $documents = [];
        foreach ($candidates as $i => $doc) {
            $count = $counts[$i];
            if ($count <= 0) {
                continue;
            }
            unset($doc['_params']);
            $doc['count'] = $count;
            $doc['weight'] ??= $count;
            $documents[] = $doc;
        }

        return $documents;
    }

    /**
     * Villes et quartiers du catalogue PUBLIC (le même `scopePublic()` que `publicFilter()` transpose), un document par
     * ville et par couple (quartier, ville). Les écritures d'un même lieu (« Grand-Yoff », « Grand Yoff ») se regroupent
     * par leur clé repliée (`CleDeQuartier`, celle du filtre `location`) ; le libellé est le nom du référentiel quand il
     * y en a un, sinon l'écriture la plus fréquente, et les autres écritures deviennent des alias.
     *
     * @return list<array<string, mixed>>
     */
    private function places(): array
    {
        $rows = Address::query()
            ->where('addressable_type', (new Property)->getMorphClass())
            ->whereIn('addressable_id', Property::query()->public()->select('id'))
            ->whereNotNull('city')
            ->selectRaw('city, neighborhood, count(*) as n')
            ->groupBy('city', 'neighborhood')
            ->get();

        $referential = $this->referentialNames();

        /** @var array<string, array{spellings: array<string, int>}> $cities */
        $cities = [];
        /** @var array<string, array{city: string, spellings: array<string, int>}> $neighborhoods */
        $neighborhoods = [];

        foreach ($rows as $row) {
            $cityKey = CleDeQuartier::de((string) $row->city);
            if ($cityKey === null) {
                continue;
            }
            $cities[$cityKey]['spellings'][(string) $row->city] = ($cities[$cityKey]['spellings'][(string) $row->city] ?? 0) + (int) $row->n;

            $key = CleDeQuartier::de($row->neighborhood === null ? null : (string) $row->neighborhood);
            if ($key !== null) {
                $neighborhoods[$cityKey."\0".$key]['spellings'][(string) $row->neighborhood] = ($neighborhoods[$cityKey."\0".$key]['spellings'][(string) $row->neighborhood] ?? 0) + (int) $row->n;
            }
        }

        $cityLabels = [];
        $documents = [];
        foreach ($cities as $cityKey => ['spellings' => $spellings]) {
            // Le libellé d'une ville est l'écriture des ADRESSES (la plus fréquente) : le filtre `city` compare ce texte,
            // et un nom du référentiel écrit autrement compterait moins de biens que la ville n'en a.
            $label = self::mostFrequent($spellings);
            $cityLabels[$cityKey] = $label;
            $documents[] = $this->placeDocument(
                SuggestionIndex::KIND_CITY,
                $label,
                null,
                [...array_keys($spellings), ...($referential['city'][$cityKey] ?? [])],
                ['city' => $label],
            );
        }

        foreach ($neighborhoods as $pair => ['spellings' => $spellings]) {
            [$cityKey, $key] = explode("\0", $pair, 2);
            $city = $cityLabels[$cityKey];
            // Le filtre `location` juge par identifiant du référentiel ou par clé repliée : toute écriture du lieu y mène,
            // le nom du référentiel compris.
            $names = $referential['neighborhood'][$cityKey."\0".$key] ?? null;
            $label = $names['name'] ?? self::mostFrequent($spellings);
            $documents[] = $this->placeDocument(
                SuggestionIndex::KIND_NEIGHBORHOOD,
                $label,
                $city,
                [...array_keys($spellings), ...($names['spellings'] ?? [])],
                ['city' => $city, 'location' => $label],
            );
        }

        return $documents;
    }

    /**
     * Les noms du référentiel (villes, quartiers approuvés, anciens noms, sources fusionnées) par clé repliée — lus par
     * `DatabasePlaceLexicon::entries()`, la source du parseur de TCK-2473 : la suggestion reconnaît les mêmes écritures.
     *
     * @return array{city: array<string, list<string>>, neighborhood: array<string, array{name: string, spellings: list<string>}>}
     */
    private function referentialNames(): array
    {
        $names = ['city' => [], 'neighborhood' => []];

        foreach ($this->lexicon->entries() as $entry) {
            if ($entry['kind'] === 'city') {
                $key = CleDeQuartier::de($entry['name']);
                if ($key !== null) {
                    $names['city'][$key][] = $entry['spelling'];
                }

                continue;
            }

            $cityKey = CleDeQuartier::de($entry['city']);
            $key = CleDeQuartier::de($entry['spelling']);
            if ($cityKey === null || $key === null) {
                continue;
            }
            $names['neighborhood'][$cityKey."\0".$key]['name'] ??= $entry['name'];
            $names['neighborhood'][$cityKey."\0".$key]['spellings'][] = $entry['spelling'];
            // L'écriture du nom lui-même mène aussi au lieu, et à ses autres écritures.
            $nameKey = CleDeQuartier::de($entry['name']);
            if ($nameKey !== null && $nameKey !== $key) {
                $names['neighborhood'][$cityKey."\0".$nameKey]['name'] ??= $entry['name'];
                $names['neighborhood'][$cityKey."\0".$nameKey]['spellings'][] = $entry['spelling'];
            }
        }

        return $names;
    }

    /**
     * @param  list<string>  $spellings
     * @param  array<string, string>  $criteria
     * @return array<string, mixed>
     */
    private function placeDocument(string $kind, string $label, ?string $city, array $spellings, array $criteria): array
    {
        return [
            'id' => $kind.'-'.sha1($label."\0".$city),
            'kind' => $kind,
            'label_fr' => $label,
            'label_en' => $label,
            'label_wo' => $label,
            'aliases' => self::aliases($spellings, [$label]),
            'value' => $label,
            'city' => $city,
            'criteria' => $criteria,
            '_params' => $criteria,
        ];
    }

    /**
     * Types de bien : le libellé des trois langues (`trans`) et, en alias, les écritures que l'index des biens reconnaît
     * déjà (`Property::TYPE_SEARCH_ALIASES`, celles que reprend le parseur de TCK-2473).
     *
     * @return list<array<string, mixed>>
     */
    private function propertyTypes(): array
    {
        $documents = [];
        foreach (PropertyType::cases() as $type) {
            $labels = [];
            foreach (['fr', 'en', 'wo'] as $locale) {
                $labels[$locale] = (string) trans("properties.type.{$type->value}", [], $locale);
            }
            $spellings = [
                ...explode(' ', Property::TYPE_SEARCH_ALIASES[$type->value] ?? ''),
                ...explode(' ', Property::TYPE_SEARCH_ALIASES_WO[$type->value] ?? ''),
            ];
            $documents[] = [
                'id' => SuggestionIndex::KIND_PROPERTY_TYPE.'-'.$type->value,
                'kind' => SuggestionIndex::KIND_PROPERTY_TYPE,
                'label_fr' => $labels['fr'],
                'label_en' => $labels['en'],
                'label_wo' => $labels['wo'],
                'aliases' => self::aliases($spellings, array_values($labels)),
                'value' => $type->value,
                'city' => null,
                'criteria' => ['type' => $type->value],
                '_params' => ['type' => $type->value],
            ];
        }

        return $documents;
    }

    /**
     * Les recherches populaires du journal, sous les seules règles d'ADR-0088 (`SearchJournal::popular()` : ≥ 5
     * visiteurs distincts un même jour, dernier nombre de résultats > 0). Une recherche par critères seuls (`text` vide)
     * n'a rien à faire correspondre à une saisie : elle n'est proposée qu'à saisie vide, par son poids.
     *
     * @return list<array<string, mixed>>
     */
    private function popularQueries(): array
    {
        $documents = [];
        foreach ($this->journal->popular('', self::POPULAR_MAX) as $popular) {
            $criteria = $popular['criteria'];
            $documents[] = [
                'id' => SuggestionIndex::KIND_QUERY.'-'.sha1($popular['text']."\0".json_encode($criteria)),
                'kind' => SuggestionIndex::KIND_QUERY,
                'label_fr' => $popular['text'],
                'label_en' => $popular['text'],
                'label_wo' => $popular['text'],
                'aliases' => [],
                'value' => $popular['text'],
                'city' => null,
                'criteria' => $criteria === [] ? new \stdClass : $criteria,
                'weight' => $popular['count'],
                '_params' => [...self::listParams($criteria), 'q' => $popular['text']],
            ];
        }

        return $documents;
    }

    /**
     * TCK-2476 — les variantes actives (`search_aliases`), quand la table existe : sans elle, aucune. Une variante d'un
     * lieu ou d'un type s'ajoute aux alias de son document ; une variante d'un TERME devient un document `alias` qui
     * propose le terme.
     *
     * @param  list<array<string, mixed>>  $documents
     * @return list<array<string, mixed>>
     */
    private function withAliases(array $documents): array
    {
        if (! Schema::hasTable('search_aliases')) {
            return $documents;
        }

        $rows = DB::table('search_aliases')->where('status', 'active')
            ->get(['alias', 'target_kind', 'target_value', 'target_city']);

        foreach ($rows as $row) {
            $alias = (string) $row->alias;
            if ($row->target_kind === 'term') {
                $term = (string) $row->target_value;
                $documents[] = [
                    'id' => SuggestionIndex::KIND_ALIAS.'-'.sha1($alias."\0".$term),
                    'kind' => SuggestionIndex::KIND_ALIAS,
                    'label_fr' => $alias,
                    'label_en' => $alias,
                    'label_wo' => $alias,
                    'aliases' => [],
                    'value' => $term,
                    'city' => null,
                    'criteria' => new \stdClass,
                    '_params' => ['q' => $term],
                ];

                continue;
            }

            foreach ($documents as $i => $doc) {
                $matches = match ($row->target_kind) {
                    'property_type' => $doc['kind'] === SuggestionIndex::KIND_PROPERTY_TYPE && $doc['value'] === $row->target_value,
                    'city' => $doc['kind'] === SuggestionIndex::KIND_CITY && CleDeQuartier::de($doc['value']) === CleDeQuartier::de((string) $row->target_value),
                    'neighborhood' => $doc['kind'] === SuggestionIndex::KIND_NEIGHBORHOOD
                        && CleDeQuartier::de($doc['value']) === CleDeQuartier::de((string) $row->target_value)
                        && ($row->target_city === null || CleDeQuartier::de((string) $doc['city']) === CleDeQuartier::de((string) $row->target_city)),
                    default => false,
                };
                if ($matches) {
                    $documents[$i]['aliases'] = self::aliases([...$doc['aliases'], $alias], [$doc['label_fr']]);
                }
            }
        }

        return $documents;
    }

    /**
     * Le total de la liste publique sous chaque jeu de paramètres, par lots de `/multi-search`.
     *
     * @param  list<array<string, mixed>>  $paramsList
     * @return list<int>
     */
    private function counts(array $paramsList): array
    {
        $counts = [];
        foreach (array_chunk($paramsList, self::COUNT_BATCH) as $batch) {
            $queries = array_map(fn (array $params): SearchQuery => $this->search->nominalQuery($params, 0), $batch);
            /** @var array{results?: list<array<string, mixed>>} $response */
            $response = $this->client->multiSearch($queries);
            $results = $response['results'] ?? [];
            if (count($results) !== count($queries)) {
                throw new RuntimeException('Le moteur a rendu '.count($results).' résultats pour '.count($queries).' requêtes de compte.');
            }
            foreach ($results as $result) {
                $counts[] = (int) ($result['totalHits'] ?? 0);
            }
        }

        return $counts;
    }

    /**
     * Les critères du journal (forme de l'URL : listes à virgules) relus en paramètres de la liste : `cities` est le
     * seul critère que la liste attend en TABLEAU (`SearchPublicPropertyRequest::villesEnListe()`).
     *
     * @param  array<string, mixed>  $criteria
     * @return array<string, mixed>
     */
    public static function listParams(array $criteria): array
    {
        if (isset($criteria['cities']) && is_string($criteria['cities'])) {
            $criteria['cities'] = array_values(array_filter(array_map('trim', explode(',', $criteria['cities'])), static fn (string $v): bool => $v !== ''));
        }

        return $criteria;
    }

    /**
     * @param  list<string>  $spellings
     * @param  list<string>  $labels
     * @return list<string>
     */
    private static function aliases(array $spellings, array $labels): array
    {
        $exclude = array_map(static fn (string $l): ?string => CleDeQuartier::de($l), $labels);
        $aliases = [];
        foreach ($spellings as $spelling) {
            $spelling = trim($spelling);
            $key = CleDeQuartier::de($spelling);
            if ($key === null || in_array($key, $exclude, true) || isset($aliases[$key])) {
                continue;
            }
            $aliases[$key] = $spelling;
        }

        return array_values($aliases);
    }

    /** @param  array<string, int>  $spellings */
    private static function mostFrequent(array $spellings): string
    {
        arsort($spellings);

        return (string) array_key_first($spellings);
    }

    /** L'index servi existe-t-il ? (`search:build-suggestions --if-missing`, joué par `docker/release.sh`.) */
    public function isServed(): bool
    {
        return $this->exists(SuggestionIndex::uid());
    }

    private function exists(string $uid): bool
    {
        try {
            $this->client->getRawIndex($uid);

            return true;
        } catch (ApiException $e) {
            if ($e->errorCode === 'index_not_found') {
                return false;
            }
            throw $e;
        }
    }

    /**
     * Les index de construction qu'une exécution interrompue a laissés (au-delà d'une heure : aucune construction
     * vivante ne dure autant).
     */
    private function sweepStaleBuilds(string $live): void
    {
        try {
            $indexes = $this->client->getIndexes((new IndexesQuery)->setLimit(1000))->getResults();
        } catch (Throwable) {
            return;
        }

        $cutoff = new DateTimeImmutable('-'.self::STALE_BUILD_SECONDS.' seconds');
        foreach ($indexes as $index) {
            $uid = (string) $index->getUid();
            $lastWrite = $index->getUpdatedAt() ?? $index->getCreatedAt();
            if (str_starts_with($uid, $live.SuggestionIndex::BUILD_MARKER) && $lastWrite !== null && $lastWrite < $cutoff) {
                try {
                    $this->client->deleteIndex($uid);
                } catch (Throwable) {
                    // la suivante
                }
            }
        }
    }

    /** @param  array<string, mixed>  $task */
    private function wait(array $task): void
    {
        $done = $this->client->waitForTask($task['taskUid'], self::TASK_TIMEOUT_MS);
        if (($done['status'] ?? null) !== 'succeeded') {
            throw new RuntimeException(sprintf(
                'Tâche Meilisearch %s (%s) : %s — %s',
                $task['taskUid'],
                $done['type'] ?? '?',
                $done['status'] ?? '?',
                json_encode($done['error'] ?? null),
            ));
        }
    }
}
