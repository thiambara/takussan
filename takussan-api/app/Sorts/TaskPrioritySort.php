<?php

namespace App\Sorts;

use App\Models\Enums\TaskPriority;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * P134.01 (TCK-1260) — trie les tâches sur le RANG de {@see TaskPriority}, dans l'ordre de ses cas,
 * et non sur la chaîne : `ORDER BY priority DESC` rendait `medium`, `low`, puis `high`. Même forme
 * que TCK-1126 pour les annonces. Utilisable comme tri `sort=priority` de spatie.
 */
class TaskPrioritySort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        self::apply($query, $descending);
    }

    /** `$descending` : la plus haute priorité d'abord ; une valeur hors de l'enum en dernier. */
    public static function apply(Builder $query, bool $descending = true): void
    {
        $cas = TaskPriority::cases();
        $sql = 'CASE priority '.implode(' ', array_fill(0, count($cas), 'WHEN ? THEN ?'))
            .' ELSE -1 END '.($descending ? 'DESC' : 'ASC');
        $bindings = [];
        foreach ($cas as $rang => $priorite) {
            array_push($bindings, $priorite->value, $rang);
        }

        $query->orderByRaw($sql, $bindings);
    }
}
