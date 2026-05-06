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

        // `allowedFields` MUST be called before `allowedIncludes`: spatie's
        // include resolver calls `getRequestedFieldsForRelatedTable()` and
        // throws `UnknownIncludedFieldsQuery` if `allowedFields` hasn't been
        // configured yet (it checks `$this->allowedFields instanceof Collection`).
        return QueryBuilder::for($subject, $request)
            ->allowedFilters(...static::getAllowedQueryFilters())
            ->allowedFields(...static::getAllAllowedQueryFields())
            ->allowedSorts(...(static::$requestSortable ?? []))
            ->allowedIncludes(...static::getAllowedQueryIncludes());
    }

    /**
     * Public accessor for `$queryFields` so sibling models can introspect each
     * other's whitelists when wiring up nested `fields[<related_table>]=…`
     * support.
     *
     * @return array<int,string>
     */
    public static function getOwnQueryFields(): array
    {
        return static::$queryFields ?? [];
    }

    /**
     * Builds the full allowed-fields list: own columns + nested
     * `<related_table>.<col>` entries derived from each loadable relation's
     * `$queryFields`. Without the nested entries, a request like
     * `fields[properties]=id,title&include=property` would pass the
     * `UnknownIncludedFieldsQuery` check (allowedFields is set) but then
     * fail `ensureAllFieldsExist()` with `InvalidFieldQuery` because
     * `properties.id` isn't in the parent's allowedFields.
     *
     * @return array<int,string>
     */
    protected static function getAllAllowedQueryFields(): array
    {
        $own = static::$queryFields ?? [];

        $nested = [];
        foreach (static::$requestLoadable ?? [] as $relationName) {
            try {
                $instance = new static;
                if (! method_exists($instance, $relationName)) {
                    continue;
                }
                $related = $instance->{$relationName}()->getRelated();
            } catch (\Throwable) {
                continue;
            }

            $relatedClass = $related::class;
            if (! method_exists($relatedClass, 'getOwnQueryFields')) {
                continue;
            }

            $tableName = $related->getTable();
            foreach ($relatedClass::getOwnQueryFields() as $field) {
                $nested[] = "{$tableName}.{$field}";
            }
        }

        return array_values(array_unique([...$own, ...$nested]));
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

        // TCK-147 — extension point for callback filters that aren't tied to a
        // column (e.g. spatie role membership). Models override
        // `customQueryFilters()` to return additional `AllowedFilter` instances.
        $custom = static::customQueryFilters();

        return array_merge($exact, $partial, $range, $search, $custom);
    }

    /**
     * Override on a model to add filters that don't fit the exact/partial/range
     * shape (e.g. `AllowedFilter::callback('role', ...)`). Default: none.
     *
     * @return array<int, AllowedFilter>
     */
    protected static function customQueryFilters(): array
    {
        return [];
    }

    /** @return array<int, AllowedInclude> */
    protected static function getAllowedQueryIncludes(): array
    {
        $relations = array_map(
            fn (string $rel) => AllowedInclude::relationship($rel),
            static::$requestLoadable ?? []
        );

        $counts = array_map(
            fn (string $rel) => AllowedInclude::count("{$rel}Count", $rel),
            static::$requestCountable ?? []
        );

        return array_merge($relations, $counts);
    }
}
