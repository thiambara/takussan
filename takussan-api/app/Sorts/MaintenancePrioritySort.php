<?php

namespace App\Sorts;

use App\Models\Enums\MaintenancePriority;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * Trie les demandes de maintenance sur le RANG de {@see MaintenancePriority} : `-priority` rend
 * `urgent` d'abord, `priority` `low` d'abord.
 *
 * TCK-1304 (P134.04) — le rang se dérive de l'ordre des cas de l'enum, comme TCK-1126 et
 * {@see TaskPrioritySort} : un cas ajouté prend sa place sans qu'on réécrive ce `CASE`. Une valeur
 * hors de l'enum sort en dernier sous `-priority`. Le sens du tri est celui de la requête, ce que lit
 * le départage par l'`id` (TCK-1296).
 */
class MaintenancePrioritySort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $cas = MaintenancePriority::cases();
        $sql = 'CASE priority '.implode(' ', array_fill(0, count($cas), 'WHEN ? THEN ?'))
            .' ELSE -1 END '.($descending ? 'DESC' : 'ASC');
        $bindings = [];
        foreach ($cas as $rang => $priorite) {
            array_push($bindings, $priorite->value, $rang);
        }

        $query->orderByRaw($sql, $bindings);
    }
}
