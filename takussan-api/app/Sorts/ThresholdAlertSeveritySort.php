<?php

namespace App\Sorts;

use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-1302 (P134.03) — trie les alertes de seuil sur le RANG de leur gravité, `info` < `warning` <
 * `critical` (les trois valeurs de la colonne, migration `create_threshold_alerts_table`), et non
 * sur la chaîne : `ORDER BY severity` rendait `critical`, `info`, puis `warning`. Même forme que
 * TCK-1126 et {@see TaskPrioritySort}. Une valeur hors de la liste sort en dernier
 * dans l'ordre décroissant.
 */
class ThresholdAlertSeveritySort implements Sort
{
    /** @var list<string> du moins grave au plus grave */
    public const RANGS = ['info', 'warning', 'critical'];

    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $sql = 'CASE severity '.implode(' ', array_fill(0, count(self::RANGS), 'WHEN ? THEN ?'))
            .' ELSE -1 END '.($descending ? 'DESC' : 'ASC');
        $bindings = [];
        foreach (self::RANGS as $rang => $gravite) {
            array_push($bindings, $gravite, $rang);
        }

        $query->orderByRaw($sql, $bindings);
    }
}
