<?php

namespace App\Models\Concerns;

use App\Http\Filters\RangeFilter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\AllowedInclude;
use Spatie\QueryBuilder\QueryBuilder;

trait HasQueryBuilder
{
    /**
     * Returns a spatie QueryBuilder pre-configured with the model's allowed
     * filters, sorts, includes and fields. Accepts an optional base query so
     * callers can apply access-control constraints before handing off to spatie.
     *
     * @param  Builder<static>|null  $baseQuery
     */
    public static function buildQuery(?Builder $baseQuery = null, ?Request $request = null): QueryBuilder
    {
        $subject = $baseQuery ?? static::class;

        return QueryBuilder::for($subject, $request)
            ->allowedFilters(...static::getAllowedQueryFilters())
            ->allowedSorts(...(static::$requestSortable ?? []))
            ->allowedIncludes(...static::getAllowedQueryIncludes())
            ->allowedFields(...(static::$queryFields ?? []));
    }

    /** @return array<int, AllowedFilter> */
    protected static function getAllowedQueryFilters(): array
    {
        $exact = array_map(
            fn (string $field) => AllowedFilter::exact($field),
            static::$requestFilterable ?? []
        );

        $partial = array_map(
            fn (string $field) => AllowedFilter::partial($field),
            static::$requestFilterablePartial ?? []
        );

        $range = [];
        foreach (static::$requestRangeFilters ?? [] as $field) {
            $range[] = AllowedFilter::custom("{$field}_min", new RangeFilter($field, 'min'));
            $range[] = AllowedFilter::custom("{$field}_max", new RangeFilter($field, 'max'));
        }

        $search = [];
        if (! empty(static::$requestSearchFields ?? [])) {
            $fields = static::$requestSearchFields;
            $search[] = AllowedFilter::callback('search', function (Builder $q, string $value) use ($fields) {
                $q->where(function (Builder $inner) use ($fields, $value) {
                    foreach ($fields as $field) {
                        $inner->orWhere($field, 'like', '%'.$value.'%');
                    }
                });
            });
        }

        return array_merge($exact, $partial, $range, $search);
    }

    /** @return array<int, AllowedInclude> */
    protected static function getAllowedQueryIncludes(): array
    {
        $relations = array_map(
            fn (string $rel) => AllowedInclude::relationship($rel),
            static::$requestLoadable ?? []
        );

        $counts = array_map(
            fn (string $rel) => AllowedInclude::count($rel),
            static::$requestCountable ?? []
        );

        return array_merge($relations, $counts);
    }
}
