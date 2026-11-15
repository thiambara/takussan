<?php

namespace App\Sorts;

use App\Services\Lease\LeaseAttention;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2642 — `sort=attention` sur la liste des baux : la file « À traiter », la gravité la plus
 * haute d'abord (de l'argent dû, puis un geste qui presse, puis une information), puis le motif le
 * plus ancien ; les baux sans motif en dernier. La règle est {@see LeaseAttention::orderBy()}, qui lit
 * les mêmes motifs que `filter[motif]` et `attention[]`, pour l'appelant (l'entrée en attente n'est
 * lue que par le personnel).
 */
class LeaseAttentionSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        LeaseAttention::for(request()->user())->orderBy($query, $descending);
    }
}
