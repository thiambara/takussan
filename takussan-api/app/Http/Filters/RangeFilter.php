<?php

namespace App\Http\Filters;

use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Filters\Filter;

/**
 * Provides filter[field_min]=X and filter[field_max]=Y range filtering.
 * Register via AllowedFilter::custom('field_min', new RangeFilter('field', 'min'))
 * and AllowedFilter::custom('field_max', new RangeFilter('field', 'max')).
 */
class RangeFilter implements Filter
{
    public function __construct(
        private readonly string $column,
        private readonly string $direction // 'min' or 'max'
    ) {}

    public function __invoke(Builder $query, mixed $value, string $property): void
    {
        if ($this->direction === 'min') {
            $query->where($this->column, '>=', $value);
        } else {
            $query->where($this->column, '<=', $value);
        }
    }
}
