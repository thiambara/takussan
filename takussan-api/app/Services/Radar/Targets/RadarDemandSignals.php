<?php

namespace App\Services\Radar\Targets;

use App\Models\Enums\PropertyType;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\SavedSearch;
use App\Services\Geo\GeoNeighborhoodResolver;
use App\Services\Search\QuartierDuFiltre;
use App\Services\Search\SearchJournal;
use App\Support\Search\CleDeQuartier;

/**
 * TCK-2470 (ADR-0087 §6, ADR-0088 §4) — la demande sans résultat, lue et regroupée par le code, AVANT tout modèle.
 *
 * Deux sources :
 *  - les recherches sauvegardées ACTIVES dont `results_count = 0` : leurs `criteria` seuls ;
 *  - `SearchJournal::zeroResultDemand(30, minVisitors: 2)` (TCK-2472) : critères structurés et visiteurs distincts.
 *
 * **Rien de ce qu'un visiteur a TAPÉ ne sort d'ici** (AC4) : ni `q` ni `normalized_query`, ni nom de recherche, ni compte,
 * ni identifiant. Un lieu (`city`, `cities`, `location`) n'entre que RECONNU par le référentiel, et sous le nom du
 * référentiel — jamais sous la forme saisie ; un lieu inconnu écarte le signal entier (l'ignorer élargirait la demande à tout
 * le pays). Ce qui ne s'exprime pas en critères de cible écarte aussi le signal : une région, un point et son rayon.
 * Les autres clés (surface, salles de bain, étiquettes, état, titre, période…) ne bornent pas une cible : elles sont ignorées.
 *
 * Les signaux de mêmes critères (même empreinte `RadarTargetCriteria::signature()`) se regroupent ; leur poids `count` est la
 * somme des recherches sauvegardées et des visiteurs distincts. Au plus {@see self::MAX_SIGNALS}, les plus lourds d'abord.
 */
final class RadarDemandSignals
{
    public const JOURNAL_DAYS = 30;

    public const JOURNAL_MIN_VISITORS = 2;

    public const MAX_SIGNALS = 200;

    /** @var array<string, string>|null clé repliée (nom ou ancien nom) → nom actuel de la ville */
    private ?array $cities = null;

    /** @var array<string, list<array{name: string, city: string}>> */
    private array $neighborhoods = [];

    public function __construct(
        private readonly SearchJournal $journal,
        private readonly QuartierDuFiltre $quartiers,
    ) {}

    /**
     * @return array{
     *     signals: list<array{ref: string, count: int, sources: array{saved_searches: int, searches: int}, criteria: array<string, mixed>}>,
     *     excluded: int,
     *     signature: string,
     * }
     */
    public function collect(): array
    {
        /** @var array<string, array{count: int, saved: int, searches: int, criteria: array<string, mixed>}> $groups */
        $groups = [];
        $excluded = 0;
        $add = function (?array $criteria, int $weight, bool $saved) use (&$groups, &$excluded): void {
            if ($criteria === null || $weight < 1) {
                $excluded++;

                return;
            }
            $key = RadarTargetCriteria::signature($criteria);
            $groups[$key] ??= ['count' => 0, 'saved' => 0, 'searches' => 0, 'criteria' => $criteria];
            $groups[$key]['count'] += $weight;
            $groups[$key][$saved ? 'saved' : 'searches'] += $weight;
        };

        // `criteria` SEULS : ni le nom de la recherche, ni son propriétaire ne sont lus.
        SavedSearch::query()
            ->where('is_active', true)
            ->where('results_count', 0)
            ->select(['id', 'criteria'])
            ->chunkById(500, function ($searches) use ($add): void {
                foreach ($searches as $search) {
                    $add($this->targetCriteria((array) ($search->criteria ?? [])), 1, true);
                }
            });

        // `normalized_query` n'est jamais lu : seuls les critères structurés et le compte de visiteurs.
        foreach ($this->journal->zeroResultDemand(self::JOURNAL_DAYS, minVisitors: self::JOURNAL_MIN_VISITORS) as $row) {
            $add($this->targetCriteria($row['criteria']), (int) $row['distinct_visitors'], false);
        }

        uksort($groups, static fn (string $a, string $b): int => [$groups[$b]['count'], $a] <=> [$groups[$a]['count'], $b]);
        $kept = array_slice($groups, 0, self::MAX_SIGNALS, true);
        $excluded += count($groups) - count($kept);

        $signals = [];
        $i = 0;
        foreach ($kept as $group) {
            $signals[] = [
                'ref' => 'd'.(++$i),
                'count' => $group['count'],
                'sources' => ['saved_searches' => $group['saved'], 'searches' => $group['searches']],
                'criteria' => RadarTargetCriteria::ordered($group['criteria']),
            ];
        }

        $signatures = array_keys($kept);
        sort($signatures);

        return [
            'signals' => $signals,
            'excluded' => $excluded,
            'signature' => hash('sha256', implode("\n", $signatures)),
        ];
    }

    /**
     * Les critères d'une recherche (forme de `SavedSearchCriteria` ou de `SearchJournal::criteria()`) rendus en critères de
     * cible normalisés, ou null si la recherche ne s'exprime pas en cible.
     *
     * @param  array<string, mixed>  $search
     * @return array<string, mixed>|null
     */
    public function targetCriteria(array $search): ?array
    {
        if (self::filled($search['region'] ?? null) || self::filled($search['lat'] ?? null) || self::filled($search['radius_km'] ?? null)) {
            return null;
        }

        $cities = [];
        foreach ([...self::list($search['cities'] ?? null), ...self::list($search['city'] ?? null)] as $text) {
            $name = $this->city($text);
            if ($name === null) {
                return null;
            }
            $cities[CleDeQuartier::de($name)] = $name;
        }

        $neighborhoods = [];
        if (self::filled($search['location'] ?? null)) {
            $found = $this->neighborhoods((string) $search['location']);
            if ($cities !== []) {
                $found = array_values(array_filter($found, static fn (array $n): bool => isset($cities[CleDeQuartier::de($n['city'])])));
            }
            if ($found === []) {
                return null;
            }
            $neighborhoods = $found;
        }

        $types = array_values(array_filter(
            self::list($search['type'] ?? null),
            static fn (string $type): bool => PropertyType::tryFrom($type) !== null,
        ));
        $contract = in_array($search['contract_type'] ?? null, RadarTargetCriteria::CONTRACTS, true) ? $search['contract_type'] : null;
        $furnished = isset($search['furnished']) ? filter_var($search['furnished'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) : null;

        try {
            return RadarTargetCriteria::normalize([
                'cities' => array_values($cities),
                'neighborhoods' => $neighborhoods,
                'types' => $types,
                'contract' => $contract,
                'price_min' => self::amount($search['price_min'] ?? null),
                'price_max' => self::amount($search['price_max'] ?? null),
                // `bedrooms` de la recherche publique est un minimum (`bedrooms >= n`, `PropertySearchService`).
                'bedrooms_min' => self::amount($search['bedrooms'] ?? null),
                'furnished' => $furnished,
            ]);
        } catch (InvalidRadarTargetCriteria) {
            return null;
        }
    }

    /**
     * Une cible COUVRE un signal si leurs critères se recouvrent : sur chaque clé que les deux contraignent, au moins une
     * valeur commune (listes), la même valeur (contrat, meublé), des fourchettes qui se chevauchent (prix, chambres). Une
     * clé que l'un des deux ne contraint pas ne sépare rien. Les lieux : une ville commune, un quartier commun, ou le quartier
     * de l'un dans une ville de l'autre — un lieu absent d'un côté ne sépare rien.
     *
     * @param  array<string, mixed>  $target
     * @param  array<string, mixed>  $signal
     */
    public static function covers(array $target, array $signal): bool
    {
        $types = [(array) ($target['types'] ?? []), (array) ($signal['types'] ?? [])];
        if ($types[0] !== [] && $types[1] !== [] && array_intersect($types[0], $types[1]) === []) {
            return false;
        }
        foreach (['contract', 'furnished'] as $key) {
            if (($target[$key] ?? null) !== null && ($signal[$key] ?? null) !== null && $target[$key] !== $signal[$key]) {
                return false;
            }
        }
        foreach (['price', 'bedrooms'] as $range) {
            $low = max((int) ($target[$range.'_min'] ?? 0), (int) ($signal[$range.'_min'] ?? 0));
            $high = min($target[$range.'_max'] ?? PHP_INT_MAX, $signal[$range.'_max'] ?? PHP_INT_MAX);
            if ($low > $high) {
                return false;
            }
        }

        return self::placesOverlap($target, $signal);
    }

    /**
     * @param  array<string, mixed>  $a
     * @param  array<string, mixed>  $b
     */
    private static function placesOverlap(array $a, array $b): bool
    {
        [$citiesA, $hoodsA] = self::placeKeys($a);
        [$citiesB, $hoodsB] = self::placeKeys($b);
        if (($citiesA === [] && $hoodsA === []) || ($citiesB === [] && $hoodsB === [])) {
            return true;
        }
        if (array_intersect($citiesA, $citiesB) !== []) {
            return true;
        }
        foreach ([[$hoodsA, $hoodsB, $citiesB], [$hoodsB, $hoodsA, $citiesA]] as [$hoods, $others, $otherCities]) {
            foreach ($hoods as [$name, $city]) {
                if ($city !== '' && in_array($city, $otherCities, true)) {
                    return true;
                }
                foreach ($others as [$otherName, $otherCity]) {
                    if ($name === $otherName && ($city === '' || $otherCity === '' || $city === $otherCity)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $criteria
     * @return array{0: list<string>, 1: list<array{0: string, 1: string}>}
     */
    private static function placeKeys(array $criteria): array
    {
        return [
            array_map(GeoNeighborhoodResolver::cle(...), (array) ($criteria['cities'] ?? [])),
            array_map(
                static fn (array $n): array => [GeoNeighborhoodResolver::cle((string) ($n['name'] ?? '')), GeoNeighborhoodResolver::cle((string) ($n['city'] ?? ''))],
                (array) ($criteria['neighborhoods'] ?? []),
            ),
        ];
    }

    /** Le nom actuel de la ville du référentiel que ce texte désigne (nom ou ancien nom), ou null. */
    private function city(string $text): ?string
    {
        if ($this->cities === null) {
            $this->cities = [];
            foreach (GeoCity::query()->get(['name', 'former_names']) as $city) {
                foreach ([$city->name, ...($city->former_names ?? [])] as $name) {
                    $key = CleDeQuartier::de(is_string($name) ? $name : null);
                    if ($key !== null) {
                        $this->cities[$key] ??= (string) $city->name;
                    }
                }
            }
        }
        $key = CleDeQuartier::de($text);

        return $key === null ? null : ($this->cities[$key] ?? null);
    }

    /**
     * Les quartiers du référentiel que ce texte désigne (nom, ancien nom, fusion suivie — {@see QuartierDuFiltre}), refusés
     * exclus, chacun avec le nom de sa ville.
     *
     * @return list<array{name: string, city: string}>
     */
    private function neighborhoods(string $text): array
    {
        $key = (string) CleDeQuartier::de($text);
        if ($key === '') {
            return [];
        }

        return $this->neighborhoods[$key] ??= GeoNeighborhood::query()
            ->with('city:id,name')
            ->whereKey($this->quartiers->idsDuReferentiel($text))
            ->where('status', '<>', ReferentialStatus::Rejected->value)
            ->orderBy('id')
            ->get(['id', 'name', 'geo_city_id'])
            ->filter(static fn (GeoNeighborhood $n): bool => $n->city !== null)
            ->map(static fn (GeoNeighborhood $n): array => ['name' => (string) $n->name, 'city' => (string) $n->city->name])
            ->values()
            ->all();
    }

    /** @return list<string> une valeur de liste : un tableau, ou une chaîne à virgules (forme de l'URL et du journal) */
    private static function list(mixed $value): array
    {
        $items = is_array($value) ? $value : (is_string($value) ? explode(',', $value) : []);

        return array_values(array_filter(array_map(static fn (mixed $v): string => is_scalar($v) ? trim((string) $v) : '', $items), static fn (string $v): bool => $v !== ''));
    }

    private static function filled(mixed $value): bool
    {
        return $value !== null && $value !== '' && $value !== [];
    }

    private static function amount(mixed $value): ?int
    {
        return is_numeric($value) && (float) $value >= 0 ? (int) round((float) $value) : null;
    }
}
