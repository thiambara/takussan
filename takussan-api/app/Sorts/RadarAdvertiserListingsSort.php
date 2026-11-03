<?php

namespace App\Sorts;

use App\Services\Radar\Observatory\RadarAdvertiserRanking;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2393 — `sort=listings_count` sur les annonceurs du Radar : le volume que rend le classement
 * ({@see RadarAdvertiserRanking::liveListings()}), en sous-requête corrélée — PostgreSQL refuse un alias de colonne dans une
 * expression d'`ORDER BY`, et la route des files ne pose aucun `withCount` de ce nom.
 */
class RadarAdvertiserListingsSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $count = RadarAdvertiserRanking::listingsCountQuery();

        $query->orderByRaw('('.$count->toSql().') '.($descending ? 'desc' : 'asc'), $count->getBindings());
    }
}
