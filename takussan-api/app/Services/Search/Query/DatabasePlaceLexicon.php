<?php

namespace App\Services\Search\Query;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\SearchAliasStatus;
use App\Models\Enums\SearchAliasTargetKind;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\SearchAlias;
use App\Services\Search\QuartierDuFiltre;
use App\Services\Search\VilleDuFiltre;
use App\Support\Search\CleDeQuartier;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

/**
 * TCK-2473 (ADR-0088) — les lieux du RÉFÉRENTIEL géographique, ceux que lisent les filtres `location`
 * ({@see QuartierDuFiltre}) et `city` ({@see VilleDuFiltre}) :
 *
 *   - chaque ville (`geo_cities`), sous son nom et ses anciens noms (`former_names`) ;
 *   - chaque quartier APPROUVÉ, avec sa ville, sous son nom et ses anciens noms. Une proposition `pending` n'est visible
 *     que de son auteur, une `rejected` de personne : aucune ne se reconnaît dans une saisie publique ;
 *   - le nom d'un quartier fusionné désigne sa cible (TCK-1052), comme dans `QuartierDuFiltre` ;
 *   - TCK-2476 — chaque variante ACTIVE d'un lieu (`search_aliases`, « wakam » → Ouakam) désigne ce lieu, s'il est encore
 *     dans le référentiel ci-dessus (sinon elle ne désigne plus rien et n'est pas lue).
 *
 * Les écritures sont repliées par {@see InMemoryPlaceLexicon} (`CleDeQuartier::de()` : minuscules, sans accents).
 *
 * En cache {@see self::TTL} secondes sous {@see self::CACHE_KEY} : un quartier approuvé, renommé ou fusionné se reconnaît
 * au plus tard après ce délai — une variante écrite ou tranchée vide le cache (`SearchAlias::forgetCaches()`).
 */
final class DatabasePlaceLexicon implements PlaceLexicon
{
    public const CACHE_KEY = 'search.place_lexicon.v1';

    public const TTL = 600;

    /** Une chaîne de fusions plus longue est une donnée corrompue (`GeoNeighborhood::SAUTS_MAX`). */
    private const MAX_HOPS = 5;

    private ?InMemoryPlaceLexicon $lexicon = null;

    public function __construct(private readonly CacheRepository $cache) {}

    public function longestMatch(array $words): ?array
    {
        $this->lexicon ??= new InMemoryPlaceLexicon($this->cache->remember(self::CACHE_KEY, self::TTL, fn (): array => $this->entries()));

        return $this->lexicon->longestMatch($words);
    }

    /** @return list<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}> */
    public function entries(): array
    {
        $entries = [];

        $cities = GeoCity::query()->orderBy('id')->get(['id', 'name', 'former_names']);
        $cityNames = $cities->pluck('name', 'id')->all();
        foreach ($cities as $city) {
            foreach (self::spellings($city->name, $city->former_names) as $spelling) {
                $entries[] = ['kind' => 'city', 'name' => (string) $city->name, 'city' => null, 'spelling' => $spelling];
            }
        }

        $neighborhoods = GeoNeighborhood::query()->orderBy('id')
            ->get(['id', 'geo_city_id', 'name', 'status', 'merged_into_id', 'former_names'])
            ->keyBy('id');
        foreach ($neighborhoods as $neighborhood) {
            $target = $neighborhood;
            for ($hop = 0; $hop < self::MAX_HOPS && $target?->merged_into_id !== null; $hop++) {
                $target = $neighborhoods->get($target->merged_into_id);
            }
            // Un quartier non fusionné n'est un lieu que s'il est approuvé ; une source fusionnée, quel que soit son
            // statut, désigne sa cible approuvée (la modération a dit que ce nom-là, c'est elle).
            if ($target === null || $target->merged_into_id !== null || $target->status !== ReferentialStatus::Approved) {
                continue;
            }
            foreach (self::spellings($neighborhood->name, $neighborhood->former_names) as $spelling) {
                $entries[] = [
                    'kind' => 'neighborhood',
                    'name' => (string) $target->name,
                    'city' => isset($cityNames[$target->geo_city_id]) ? (string) $cityNames[$target->geo_city_id] : null,
                    'spelling' => $spelling,
                ];
            }
        }

        return [...$entries, ...self::aliasEntries($entries)];
    }

    /**
     * TCK-2476 — les variantes actives d'un lieu, rattachées au lieu du référentiel qu'elles désignent (une ville par
     * son nom ; un quartier par son nom et, si la variante la porte, sa ville).
     *
     * @param  list<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}>  $places
     * @return list<array{kind: 'city'|'neighborhood', name: string, city: ?string, spelling: string}>
     */
    private static function aliasEntries(array $places): array
    {
        $byName = [];
        foreach ($places as $place) {
            $byName[$place['kind'].'|'.CleDeQuartier::de($place['name'])][$place['city'] ?? ''] = $place;
        }

        $entries = [];
        $aliases = SearchAlias::query()
            ->where('status', SearchAliasStatus::Active->value)
            ->whereIn('target_kind', [SearchAliasTargetKind::City->value, SearchAliasTargetKind::Neighborhood->value])
            ->orderBy('id')
            ->get(['alias', 'target_kind', 'target_value', 'target_city']);
        foreach ($aliases as $alias) {
            $known = $byName[$alias->target_kind->value.'|'.CleDeQuartier::de($alias->target_value)] ?? [];
            foreach ($known as $place) {
                if ($alias->target_city !== null && CleDeQuartier::de($place['city']) !== CleDeQuartier::de($alias->target_city)) {
                    continue;
                }
                $entries[] = ['kind' => $place['kind'], 'name' => $place['name'], 'city' => $place['city'], 'spelling' => (string) $alias->alias];
            }
        }

        return $entries;
    }

    /** @return list<string> le nom et les anciens noms */
    private static function spellings(mixed $name, mixed $formerNames): array
    {
        return array_values(array_filter(
            [$name, ...(is_array($formerNames) ? $formerNames : [])],
            static fn (mixed $spelling): bool => is_string($spelling) && trim($spelling) !== '',
        ));
    }
}
