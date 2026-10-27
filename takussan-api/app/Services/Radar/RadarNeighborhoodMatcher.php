<?php

namespace App\Services\Radar;

use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Services\Geo\GeoNeighborhoodResolver;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * TCK-2386 (ADR-0077 §5, ADR-0062 §1 et §4, AC5) — le quartier lu dans une annonce, rapproché du
 * référentiel PAR DU CODE, jamais par l'IA : le modèle recopie « Liberté 6 », ce service le
 * rattache ou propose.
 *
 *   - **Rattachement** : la clé de {@see GeoNeighborhoodResolver::cle()} (casse, blancs, tirets et
 *     apostrophes repliés ; accents distincts, ADR-0062 §1). Un fusionné rend sa cible, un refusé ne
 *     rend rien ; seul un quartier **approuvé** fait foi — une proposition en attente n'est
 *     visible que de son auteur (ADR-0062 §5), le Radar ne s'y rattache pas. Exactement un quartier
 *     → rattaché ; plusieurs (même nom dans deux villes) → suggestions.
 *   - **Suggestions** (aucun rattachement) : sur la clé SANS accents ({@see
 *     GeoNeighborhoodResolver::cleSansAccents()}) — même nom à l'accent près, puis préfixe
 *     (« Liberté » → Liberté 1…6), inclusion, et nom contenu dans le texte (« Mermoz Pyrotechnie »
 *     → Mermoz). Au plus {@see self::MAX_SUGGESTIONS}, **jamais un choix** : l'humain tranche.
 *   - **Ville** : un nom de ville qui se replie sur une ou plusieurs villes du référentiel borne la
 *     recherche à celles-ci ; une ville inconnue ne borne rien.
 *
 * Bornage des requêtes : le rattachement compare la clé en SQL (l'expression de
 * `GeoNeighborhoodResolver::trouver()`) ; les suggestions lisent `id`, `name`, `geo_city_id` des
 * quartiers approuvés et non fusionnés de la ville, ou du référentiel entier sans ville (quelques
 * centaines de lignes, ADR-0062 §3) — la base ne replie pas les accents (ADR-0020 §2), ce repli se
 * fait donc en PHP.
 */
final class RadarNeighborhoodMatcher
{
    public const MAX_SUGGESTIONS = 5;

    /** @return array{neighborhood_id: ?int, suggestions: list<array{id: int, name: string, city: string}>} */
    public function match(string $text, ?string $cityText): array
    {
        $key = GeoNeighborhoodResolver::cle($text);
        if ($key === '') {
            return ['neighborhood_id' => null, 'suggestions' => []];
        }

        $cityIds = $cityText === null ? [] : $this->cityIds($cityText);

        $exact = $this->exact($key, $cityIds);
        if ($exact->count() === 1) {
            return ['neighborhood_id' => (int) $exact->first()->getKey(), 'suggestions' => []];
        }

        $candidates = $exact->isNotEmpty() ? $exact : $this->approximate($text, $cityIds);

        return ['neighborhood_id' => null, 'suggestions' => $this->suggestions($candidates)];
    }

    /** @return list<int> */
    private function cityIds(string $cityText): array
    {
        $key = GeoNeighborhoodResolver::cle($cityText);
        if ($key === '') {
            return [];
        }

        return GeoCity::query()
            ->whereRaw($this->keySql(), [GeoNeighborhoodResolver::SEPARATEURS, $key])
            ->pluck('id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->all();
    }

    /**
     * Les quartiers qui font foi pour cette clé : fusionnés remplacés par leur cible, refusés et non
     * approuvés écartés, dédoublonnés.
     *
     * @param  list<int>  $cityIds
     * @return Collection<int, GeoNeighborhood>
     */
    private function exact(string $key, array $cityIds): Collection
    {
        return $this->inCities(GeoNeighborhood::query(), $cityIds)
            ->whereRaw($this->keySql(), [GeoNeighborhoodResolver::SEPARATEURS, $key])
            ->orderBy('id')
            ->get()
            ->map(static fn (GeoNeighborhood $n): ?GeoNeighborhood => $n->canonique())
            ->filter(static fn (?GeoNeighborhood $n): bool => $n !== null && $n->status === ReferentialStatus::Approved)
            ->unique(static fn (GeoNeighborhood $n): int => (int) $n->getKey())
            ->values();
    }

    /**
     * @param  list<int>  $cityIds
     * @return Collection<int, GeoNeighborhood>
     */
    private function approximate(string $text, array $cityIds): Collection
    {
        $key = GeoNeighborhoodResolver::cleSansAccents($text);
        if (mb_strlen($key) < 2) {
            return collect();
        }

        return $this->inCities(GeoNeighborhood::query(), $cityIds)
            ->where('status', ReferentialStatus::Approved->value)
            ->whereNull('merged_into_id')
            ->get(['id', 'name', 'geo_city_id'])
            ->map(static fn (GeoNeighborhood $n): array => ['n' => $n, 'rank' => self::rank($key, GeoNeighborhoodResolver::cleSansAccents((string) $n->name))])
            ->filter(static fn (array $c): bool => $c['rank'] !== null)
            ->sort(static fn (array $a, array $b): int => ($a['rank'] <=> $b['rank'])
                ?: strnatcasecmp((string) $a['n']->name, (string) $b['n']->name)
                ?: ((int) $a['n']->id <=> (int) $b['n']->id))
            ->map(static fn (array $c): GeoNeighborhood => $c['n'])
            ->values();
    }

    /** 0 : même nom à l'accent près ; 1 : préfixe ; 2 : inclusion ; 3 : nom contenu dans le texte ; null : sans rapport. */
    private static function rank(string $key, string $name): ?int
    {
        return match (true) {
            $name === '' => null,
            $name === $key => 0,
            str_starts_with($name, $key) => 1,
            str_contains($name, $key) => 2,
            str_contains(' '.$key.' ', ' '.$name.' ') => 3,
            default => null,
        };
    }

    /**
     * @param  Collection<int, GeoNeighborhood>  $neighborhoods
     * @return list<array{id: int, name: string, city: string}>
     */
    private function suggestions(Collection $neighborhoods): array
    {
        $neighborhoods = $neighborhoods->take(self::MAX_SUGGESTIONS);
        $cities = GeoCity::query()
            ->whereIn('id', $neighborhoods->pluck('geo_city_id')->unique()->values())
            ->pluck('name', 'id');

        return $neighborhoods
            ->map(static fn (GeoNeighborhood $n): array => [
                'id' => (int) $n->getKey(),
                'name' => (string) $n->name,
                'city' => (string) ($cities[$n->geo_city_id] ?? ''),
            ])
            ->values()
            ->all();
    }

    /**
     * @param  Builder<GeoNeighborhood>  $query
     * @param  list<int>  $cityIds
     * @return Builder<GeoNeighborhood>
     */
    private function inCities(Builder $query, array $cityIds): Builder
    {
        return $cityIds === [] ? $query : $query->whereIn('geo_city_id', $cityIds);
    }

    /** La clé SQL d'un nom — l'expression de `GeoNeighborhoodResolver::trouver()`, au caractère près. */
    private function keySql(): string
    {
        return 'btrim(regexp_replace('.CaseInsensitive::sql('name').", ?, ' ', 'g')) = ?";
    }
}
