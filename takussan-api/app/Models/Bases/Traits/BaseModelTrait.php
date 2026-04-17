<?php

namespace App\Models\Bases\Traits;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Adds request-driven query scopes to Eloquent models.
 *
 * Supported request conventions (all namespaced by table name):
 *   ?{table}.filter[field]=value                    Exact match
 *   ?{table}.filter[field@like]=foo                 LIKE %foo%
 *   ?{table}.filter[field@in][]=a&...[]=b           WHERE IN
 *   ?{table}.filter[!field]=value                   NOT equal
 *   ?{table}.filter[field]=100..500                 Range (BETWEEN)
 *   ?{table}.order_by[field]=asc|desc
 *   ?{table}.with[]=relation
 *   ?{table}.with_count[]=relation
 *   ?{table}.per_page=50
 *
 * Generic fallbacks (without table prefix) are also accepted.
 */
trait BaseModelTrait
{
    public static function allThroughRequest(?Request $request = null): Builder
    {
        $req = $request ?: request();
        $query = static::query();

        static::applyEagerLoadsFromRequest($query, $req);
        static::applyFiltersFromRequest($query, $req);
        static::applyOrderingFromRequest($query, $req);

        return $query;
    }

    public static function filterThroughRequest(?Request $request = null): Builder
    {
        $req = $request ?: request();
        $query = static::query();
        static::applyFiltersFromRequest($query, $req);

        return $query;
    }

    public static function orderThroughRequest(?Request $request = null): Builder
    {
        $req = $request ?: request();
        $query = static::query();
        static::applyOrderingFromRequest($query, $req);

        return $query;
    }

    public function paginatedThroughRequest(?Request $request = null)
    {
        $req = $request ?: request();
        $table = (new static)->getTable();
        $perPage = (int) ($req->input("$table.per_page") ?? $req->input('per_page') ?? 20);
        $perPage = max(1, min($perPage, 200));

        return static::allThroughRequest($req)->paginate($perPage);
    }

    protected static function applyFiltersFromRequest(Builder $query, Request $request): void
    {
        $table = (new static)->getTable();
        $filters = (array) ($request->input("$table.filter") ?? $request->input('filter', []));

        foreach ($filters as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            $negate = false;
            if (is_string($key) && str_starts_with($key, '!')) {
                $negate = true;
                $key = substr($key, 1);
            }

            if (is_string($key) && str_ends_with($key, '@like')) {
                $column = substr($key, 0, -5);
                $query->where($column, $negate ? 'not like' : 'like', '%'.$value.'%');

                continue;
            }

            if (is_string($key) && str_ends_with($key, '@in')) {
                $column = substr($key, 0, -3);
                $values = (array) $value;
                $negate ? $query->whereNotIn($column, $values) : $query->whereIn($column, $values);

                continue;
            }

            if (is_string($key) && str_ends_with($key, '@between')) {
                $column = substr($key, 0, -8);
                $range = is_array($value) ? $value : explode('..', (string) $value);
                if (count($range) === 2) {
                    $negate
                        ? $query->whereNotBetween($column, [$range[0], $range[1]])
                        : $query->whereBetween($column, [$range[0], $range[1]]);
                }

                continue;
            }

            if (is_string($value) && str_contains($value, '..')) {
                [$min, $max] = explode('..', $value, 2);
                if ($min !== '' && $max !== '') {
                    $negate
                        ? $query->whereNotBetween($key, [$min, $max])
                        : $query->whereBetween($key, [$min, $max]);

                    continue;
                }
                if ($min !== '') {
                    $query->where($key, $negate ? '<' : '>=', $min);

                    continue;
                }
                if ($max !== '') {
                    $query->where($key, $negate ? '>' : '<=', $max);

                    continue;
                }
            }

            if (is_array($value)) {
                $negate ? $query->whereNotIn($key, $value) : $query->whereIn($key, $value);

                continue;
            }

            $query->where($key, $negate ? '!=' : '=', $value);
        }
    }

    protected static function applyOrderingFromRequest(Builder $query, Request $request): void
    {
        $table = (new static)->getTable();
        $order = (array) ($request->input("$table.order_by") ?? $request->input('order_by', []));

        foreach ($order as $column => $direction) {
            $direction = strtolower((string) $direction) === 'desc' ? 'desc' : 'asc';
            $query->orderBy($column, $direction);
        }
    }

    protected static function applyEagerLoadsFromRequest(Builder $query, Request $request): void
    {
        $table = (new static)->getTable();

        $with = (array) ($request->input("$table.with") ?? $request->input('with', []));
        if ($with) {
            $query->with($with);
        }

        $withCount = (array) ($request->input("$table.with_count") ?? $request->input('with_count', []));
        if ($withCount) {
            $query->withCount($withCount);
        }
    }

    /**
     * Simple filter scope retained for backwards compatibility.
     *
     * @param  array<string,mixed>  $filters
     */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        foreach ($filters as $field => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            if (is_string($field) && str_ends_with($field, '@like')) {
                $column = substr($field, 0, -5);
                $query->where($column, 'like', '%'.$value.'%');

                continue;
            }

            if (is_array($value)) {
                $query->whereIn($field, $value);

                continue;
            }

            $query->where($field, $value);
        }

        return $query;
    }
}
