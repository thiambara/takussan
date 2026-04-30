<?php

namespace App\Sorts;

use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

class MaintenancePrioritySort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        // If $descending is true (e.g. -priority), we want Urgent (highest) first.
        // We order by CASE... ASC when descending=true, so 1 (urgent) comes first.
        $direction = $descending ? 'ASC' : 'DESC';
        $query->orderByRaw("
            CASE priority 
                WHEN 'urgent' THEN 1 
                WHEN 'high' THEN 2 
                WHEN 'normal' THEN 3 
                WHEN 'low' THEN 4 
                ELSE 5 
            END {$direction}
        ");
    }
}
