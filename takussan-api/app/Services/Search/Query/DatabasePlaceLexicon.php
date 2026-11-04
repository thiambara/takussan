<?php

namespace App\Services\Search\Query;

use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Services\Search\QuartierDuFiltre;
use App\Services\Search\VilleDuFiltre;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

/**
 * TCK-2473 (ADR-0088) — les lieux du RÉFÉRENTIEL géographique, ceux que lisent les filtres `location`
 * ({@see QuartierDuFiltre}) et `city` ({@see VilleDuFiltre}) :
 *
 *   - chaque ville (`geo_cities`), sous son nom et ses anciens noms (`former_names`) ;
 *   - chaque quartier APPROUVÉ, avec sa ville, sous son nom et ses anciens noms. Une proposition `pending` n'est visible
 *     que de son auteur, une `rejected` de personne : aucune ne se reconnaît dans une saisie publique ;
 *   - le nom d'un quartier fusionné désigne sa cible (TCK-1052), comme dans `QuartierDuFiltre`.
 *
 * Les écritures sont repliées par {@see InMemoryPlaceLexicon} (`CleDeQuartier::de()` : minuscules, sans accents).
 *
 * En cache {@see self::TTL} secondes sous {@see self::CACHE_KEY} : un quartier approuvé, renommé ou fusionné se reconnaît
 * au plus tard après ce délai. TCK-2474 et TCK-2476 ajouteront les variantes d'écriture à {@see self::entries()}.
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
