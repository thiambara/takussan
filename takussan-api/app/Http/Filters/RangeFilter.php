<?php

namespace App\Http\Filters;

use App\Support\DayRange;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Validator;
use Spatie\QueryBuilder\Filters\Filter;

/**
 * Provides filter[field_min]=X and filter[field_max]=Y range filtering.
 * Register via AllowedFilter::custom('field_min', new RangeFilter('field', 'min'))
 * and AllowedFilter::custom('field_max', new RangeFilter('field', 'max')).
 *
 * TCK-1409 (P151.02) — la valeur est jugée selon le cast de la colonne avant d'atteindre
 * PostgreSQL : une colonne `date`/`datetime` par la règle `date`, toute autre (montants, surface)
 * par la règle `numeric`. Une valeur illisible rend 422, comme `DateBoundaryFilter`, au lieu d'un
 * 500 (`22P02`, `22007`). Une borne haute en date seule sur un horodatage couvre tout le jour
 * (`< DayRange::after`) : `<= 2026-10-22` aurait écarté une visite de 12 h ce jour-là.
 */
class RangeFilter implements Filter
{
    public function __construct(
        private readonly string $column,
        private readonly string $direction // 'min' or 'max'
    ) {}

    public function __invoke(Builder $query, mixed $value, string $property): void
    {
        $cast = $query->getModel()->getCasts()[$this->column] ?? null;
        $isDate = is_string($cast) && preg_match('/^(immutable_)?date/', $cast) === 1;
        $isTimestamp = $isDate && str_contains($cast, 'datetime');

        Validator::make(
            ['filter' => [$property => $value]],
            ["filter.{$property}" => $isDate ? ['string', 'date'] : ['numeric']],
        )->validate();

        if ($this->direction === 'min') {
            $query->where($this->column, '>=', $value);

            return;
        }

        if ($isTimestamp && ! str_contains((string) $value, ':')) {
            $query->where($this->column, '<', DayRange::after((string) $value));

            return;
        }

        $query->where($this->column, '<=', $value);
    }
}
