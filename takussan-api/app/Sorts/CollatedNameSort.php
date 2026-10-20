<?php

namespace App\Sorts;

use Illuminate\Database\Eloquent\Builder;
use InvalidArgumentException;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * P51.05 — trie une colonne de nom de personne en `COLLATE "und-x-icu"` (ADR-0025, amendement du
 * 2026-10-19). La base est en `--locale=C` : un `ORDER BY` nu suit l'ordre des octets, et toute
 * minuscule ou initiale accentuée passe après « Z » (« awa », « Élodie » après « Zeynab »).
 *
 * `$property` est la colonne, écrite par le code (`AllowedSort::custom('first_name', new
 * CollatedNameSort, 'users.first_name')`), jamais par la requête : elle est tout de même
 * contrôlée, puisqu'elle entre dans du SQL brut.
 */
class CollatedNameSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        if (preg_match('/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/', $property) !== 1) {
            throw new InvalidArgumentException("Colonne de tri invalide : {$property}");
        }

        $column = implode('.', array_map(fn (string $part) => '"'.$part.'"', explode('.', $property)));

        $query->orderByRaw($column.' COLLATE "und-x-icu" '.($descending ? 'DESC' : 'ASC'));
    }
}
