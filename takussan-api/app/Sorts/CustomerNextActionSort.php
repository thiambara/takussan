<?php

namespace App\Sorts;

use App\Services\Crm\CustomerNextActionQuery;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2588 — `sort=next_action_at` : par l'instant de la prochaine action
 * ({@see CustomerNextActionQuery::atSql()}), les fiches sans action en dernier dans les deux sens.
 */
class CustomerNextActionSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $viewer = request()->user();
        if ($viewer === null) {
            return;
        }

        (new CustomerNextActionQuery($viewer))->sort($query, $descending);
    }
}
