<?php

namespace App\Services\Search;

use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\Engine;
use Meilisearch\Contracts\FacetSearchQuery;
use Meilisearch\Contracts\SearchQuery;

/**
 * Suggestion de la barre de recherche publique.
 *
 * TCK-335 — DEUX chemins, et le partage est delibere :
 *
 * | groupe            | chemin      | pourquoi                                       |
 * |-------------------|-------------|------------------------------------------------|
 * | `cities`          | Meilisearch | tolerance a la faute (`mrmoz` -> `Mermoz`)      |
 * | `neighborhoods`   | Meilisearch | idem, + le couple (quartier, ville) exact       |
 * | `property_types`  | base SQL    | l'enum est indexee en ANGLAIS, cf. plus bas     |
 *
 * ⚠ `property_types` RESTE sur `trans()`, et c'est MESURE (2026-08-21, base
 * locale, 258 biens publics) :
 *
 *     facet-search type facetQuery=appart -> [{"value":"apartment","count":63}]
 *     facet-search type facetQuery=maison -> []
 *
 * `type` est indexe par la valeur d'enum anglaise et `type_label` est
 * *searchable* mais pas *filterable*, donc pas facetable. Basculer ce groupe
 * sur le moteur rendrait des libelles anglais a un utilisateur francophone et
 * ne repondrait plus a « maison » — c'est-a-dire detruirait la localisation de
 * la suggestion. Le chemin par la base rend `maison -> Maison (23)` et
 * `appart -> Appartement (35)`, dans les trois langues.
 *
 * ⚠ Ce chemin s'appelait « chemin MySQL » jusqu'au 2026-08-22, et ce n'etait pas
 * un detail de vocabulaire : il ne designait PAS un moteur, mais « la base plutot
 * que l'index ». MySQL a ete retire par ADR-0020 (PostgreSQL 17 partout, suite de
 * tests comprise) et le nom a survecu au moteur, decrivant un `groupBy` portable
 * par le nom d'un produit qui n'est plus la. *Nommer un chemin de code d'apres un
 * fournisseur oblige a le renommer chaque fois qu'il change, et personne ne le
 * fait.* Le partage est entre la BASE et MEILISEARCH, il l'a toujours ete.
 */
class SuggestService
{
    /**
     * Le compte d'une facette est celui du filtre sous lequel on la demande :
     * une suggestion « Mermoz (20) » DOIT mener a 20 resultats. C'est pour ca
     * que le filtre public n'est pas recopie ici mais emprunte au service qui
     * sert `/search` — cf. {@see PropertySearchService::publicFilter()}.
     */
    public function __construct(
        private readonly CacheRepository $cache,
    ) {}

    /**
     * @return array{cities: list<array<string,mixed>>, neighborhoods: list<array<string,mixed>>, property_types: list<array<string,mixed>>}
     */
    public function resolve(string $q, int $limit, string $locale): array
    {
        $q = trim($q);

        if ($q === '') {
            return ['cities' => [], 'neighborhoods' => [], 'property_types' => []];
        }

        return [
            'cities' => $this->suggestCities($q, $limit),
            'neighborhoods' => $this->suggestNeighborhoods($q, $limit),
            'property_types' => $this->filterPrefix($this->types($locale), $this->normalize($q), $limit),
        ];
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function suggestCities(string $q, int $limit): array
    {
        return array_map(
            fn (array $hit): array => [
                'label' => $hit['value'],
                'slug' => Str::slug($hit['value']),
                'count' => $hit['count'],
            ],
            $this->facetHits('city', $q, $limit),
        );
    }

    /**
     * Quartiers, avec leur ville — et le compte du COUPLE, pas du quartier seul.
     *
     * L'interface construit `?city=<ville>&location=<quartier>`
     * (`SearchAutocomplete.buildUrl`) : si un meme nom de quartier existait dans
     * deux villes, le compte agrege de la facette `neighborhood` promettrait
     * plus que ce que ce lien rend. Un second appel — groupe en UN
     * `/multi-search`, donc deux aller-retours en tout, quel que soit `limit` —
     * ventile chaque quartier par ville et rend une ligne par couple.
     *
     * @return list<array<string,mixed>>
     */
    private function suggestNeighborhoods(string $q, int $limit): array
    {
        $hits = $this->facetHits('neighborhood', $q, $limit);

        if ($hits === []) {
            return [];
        }

        $labels = array_map(static fn (array $hit): string => (string) $hit['value'], $hits);
        $uid = $this->indexUid();

        $queries = array_map(
            fn (string $label): SearchQuery => (new SearchQuery)
                ->setIndexUid($uid)
                ->setQuery('')
                ->setFilter([...PropertySearchService::publicFilter(), 'neighborhood = '.$this->quote($label)])
                ->setFacets(['city'])
                ->setHitsPerPage(0),
            $labels,
        );

        /** @var array{results?: array<int, array<string,mixed>>} $response */
        $response = $this->engine()->multiSearch($queries);
        $results = $response['results'] ?? [];

        $rows = [];
        foreach ($labels as $i => $label) {
            /** @var array<string,int> $cities */
            $cities = $results[$i]['facetDistribution']['city'] ?? [];
            foreach ($cities as $city => $count) {
                $rows[] = [
                    'label' => $label,
                    'city' => (string) $city,
                    'slug' => Str::slug($label),
                    'count' => (int) $count,
                ];
            }
        }

        usort($rows, static fn (array $a, array $b): int => [$b['count'], $a['label']] <=> [$a['count'], $b['label']]);

        return array_slice($rows, 0, $limit);
    }

    /**
     * Une facette du catalogue public, interrogee en tolerance a la faute.
     *
     * ⚠ CE QUE `facet-search` N'APPORTE PAS — mesure le 2026-08-21, a ecrire ici
     * pour qu'on ne promette pas davantage a l'interface :
     *
     *     mrmoz  -> Mermoz   ✓ (une faute, sur un mot de 5 caracteres)
     *     akar   -> rien     ✗ c'est du PREFIXE, pas de la sous-chaine
     *     gorgui -> rien     ✗ pas de mot interne
     *     dakr   -> rien     ✗ 4 caracteres < minWordSizeForTypos.oneTypo = 5
     *
     * La tolerance couvre donc la faute de frappe, pas la recherche partielle :
     * `mrmoz` passe DE JUSTESSE, parce qu'il fait exactement 5 caracteres.
     *
     * ⚠⚠ `facetDistribution` (celle que `PropertySearchService` rend deja dans
     * `facets`) est INUTILISABLE ici, et c'est mesure : sur `q=mrmoz` elle liste
     * les villes des 43 biens TROUVES, donc l'interface afficherait
     * « Ziguinchor (4) » pour la saisie « mrmoz ». Une facette de resultats
     * n'est pas une suggestion de terme.
     *
     * @return list<array{value:string,count:int}>
     */
    private function facetHits(string $facet, string $q, int $limit): array
    {
        $hits = $this->engine()
            ->index($this->indexUid())
            ->facetSearch(
                (new FacetSearchQuery)
                    ->setFacetName($facet)
                    ->setFacetQuery($q)
                    ->setFilter(PropertySearchService::publicFilter())
            )
            ->getFacetHits();

        $rows = [];
        foreach ($hits as $hit) {
            $rows[] = ['value' => (string) $hit['value'], 'count' => (int) $hit['count']];
        }

        // Meilisearch ne garantit pas l'ordre des `facetHits` ; l'ancien chemin
        // par la base triait `count desc, label asc` et l'interface les affiche
        // dans l'ordre recu — on le refait explicitement.
        usort($rows, static fn (array $a, array $b): int => [$b['count'], $a['value']] <=> [$a['count'], $b['value']]);

        return array_slice($rows, 0, $limit);
    }

    /**
     * Types de bien — chemin par la base + `trans()`, cf. l'en-tete de la classe.
     *
     * @return list<array<string,mixed>>
     */
    private function types(string $locale): array
    {
        return $this->cache->remember(
            "search:suggest:types:{$locale}",
            300,
            fn (): array => $this->resolveTypes($locale),
        );
    }

    /** @return list<array<string,mixed>> */
    private function resolveTypes(string $locale): array
    {
        $counts = Property::query()
            ->public()
            ->groupBy('type')
            ->select('type', DB::raw('count(*) as count'))
            ->get()
            ->keyBy('type');

        return collect(PropertyType::cases())
            ->map(function (PropertyType $type) use ($counts, $locale): array {
                $count = isset($counts[$type->value]) ? (int) $counts[$type->value]->count : 0;
                $label = (string) trans("properties.type.{$type->value}", [], $locale);

                return [
                    'label' => $label,
                    'value' => $type->value,
                    'count' => $count,
                    'normalized_label' => $this->normalize($label),
                ];
            })
            ->filter(fn ($row) => $row['count'] > 0)
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    private function normalize(string $s): string
    {
        return Str::ascii(Str::lower(trim($s)));
    }

    private function quote(string $value): string
    {
        return "'".str_replace(['\\', "'"], ['\\\\', "\\'"], $value)."'";
    }

    /**
     * @return Engine
     */
    private function engine()
    {
        // Le moteur CONFIGURE, jamais `engine('meilisearch')` en dur : c'est le
        // meme que celui par lequel `PropertySearchService` sert `/search`, donc
        // le meme prefixe d'index — y compris celui, par execution, que le
        // harnais de tests pose dans `SCOUT_PREFIX` (cf. Tests\Support\TestSearchIndex).
        return app(EngineManager::class)->engine();
    }

    private function indexUid(): string
    {
        return (new Property)->searchableAs();
    }

    /**
     * @param  list<array<string,mixed>>  $rows
     * @return list<array<string,mixed>>
     */
    private function filterPrefix(array $rows, string $needle, int $limit): array
    {
        $results = [];
        foreach ($rows as $row) {
            if (str_starts_with((string) $row['normalized_label'], $needle)) {
                $clean = $row;
                unset($clean['normalized_label']);
                $results[] = $clean;
            }
            if (count($results) >= $limit) {
                break;
            }
        }

        return $results;
    }
}
