<?php

namespace App\Sorts;

use App\Services\Crm\CustomerFollowUpQuery;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2588 — `sort=-follow_up_days` : la relance la plus en retard d'abord. Le retard croît quand
 * l'instant de la relance recule : `-follow_up_days` trie cet instant du plus ancien au plus récent.
 * Les fiches sans relance viennent en dernier, dans les deux sens.
 */
class CustomerFollowUpSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $viewer = request()->user();
        if ($viewer === null) {
            return;
        }

        (new CustomerFollowUpQuery($viewer))->sort($query, $descending);
    }
}
