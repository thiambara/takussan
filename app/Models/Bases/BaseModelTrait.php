<?php

namespace App\Models\Bases;


use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;

/**
 * @method static self create(array $attributes)
 * @method static Builder|self filterThroughRequest()
 * @method static Builder|self orderThroughRequest()
 * @method static Builder|self allThroughRequest()
 */
trait BaseModelTrait
{


    /**
     * ADDED METHODS
     */

    public static function createMany(array $objects): array
    {
        $result = [];
        foreach ($objects as $o) {
            /**
             * @var static $object
             */
            $object = static::create($o);
            $object->save();
            $result[] = $object;
        }

        return $result;
    }

    /**
     * SCOPE
     */

    public function scopeFilterThroughRequest(Builder $builder): Builder
    {
//        $builder->where('status', 'in', ['active']);
//        return $builder;
        if (!empty($credentials = request()->input('filter_fields'))) {
            $c = [];
            foreach ($credentials as $key => $value) {
                $c[to_snake_case($key)] = $value;
            }
            $credentials = utils()::filterByKeys($c, $this->getColumns());
            $this->doFilter($builder, $credentials);
        }
        return $builder;
    }

    /**
     * Return model columns list
     *
     */
    public function getColumns(): array
    {
        return Schema::getColumnListing($this->getTable());
    }

    public function doFilter(Builder $builder, $credentials): Builder
    {
        foreach ($credentials as $key => $value) {
            if (is_array($value)) {
                $builder->where(function (Builder $b) use ($key, $value) {
                    foreach ($value as $index => $val) {
                        if ($val = str($val)->trim()) {
                            $opAndVal = $this->getFilterOpAndValue($val);
                            $this->applyFilter($b, $key, $opAndVal, $index === 0);
                        }
                    }
                    return $b;

                });
            } else {
                if (str($value)->trim()) {
                    $opAndVal = $this->getFilterOpAndValue($value);
                    $this->applyFilter($builder, $key, $opAndVal);
                }
            }
        }
        return $builder;
    }

    public function getFilterOpAndValue($value): array
    {
        $v = str($value);
        $useNot = false;
        $operator = '=';

        // check if the value starts with '!', that would mean that the operation is negated
        if ($v->startsWith('!')) {
            $useNot = true;
            $v = $v->substr(1);
            $value = $v;
        }

        if ($v->contains('..')) {
            return [
                'operator' => 'between',
                'value' => $v->split('/\.\./')->toArray(),
                'useNot' => $useNot
            ];
        }

        $a = $v->split('/\s/');
        if ($a->count() > 1) {
            $first = str($a->first())->trim();
            $rest = $a->slice(1)->implode('');
            switch ($first) {
                case '@like':
                    return [
                        'operator' => 'like',
                        'value' => $rest,
                        'useNot' => $useNot
                    ];
                case '@in':
                case '@between':
                    return [
                        'operator' => $first->remove('@')->value(),
                        'value' => str($rest)->split('/,|\s|\.\./')->toArray(),// separate by comma, space or double dot
                        'useNot' => $useNot
                    ];
                default:
                    if (collect(['=', '!=', '<>', '>', '<', '>=', '<='])->contains($first)) {
                        return [
                            'operator' => $first,
                            'value' => $rest,
                            'useNot' => $useNot
                        ];
                    }
            }
        }

        return compact('operator', 'value', 'useNot');
    }

    public function applyFilter(Builder $builder, string $key, array $opAndVal, $useAnd = true): Builder
    {
        if ($opAndVal['operator'] === 'between') {
            $method = $useAnd
                ? ($opAndVal['useNot'] ? 'whereNotBetween' : 'whereBetween')
                : ($opAndVal['useNot'] ? 'orWhereNotBetween' : 'orWhereBetween');
            $params = [$key, $opAndVal['value']];
        } elseif ($opAndVal['operator'] === 'in') {
            $method = $useAnd
                ? ($opAndVal['useNot'] ? 'whereNotIn' : 'whereIn')
                : ($opAndVal['useNot'] ? 'orWhereNotIn' : 'orWhereIn');
            $params = [$key, $opAndVal['value']];
        } else {
            $method = $useAnd
                ? ($opAndVal['useNot'] ? 'whereNot' : 'where')
                : ($opAndVal['useNot'] ? 'orWhereNot' : 'orWhere');
            $params = [$key, $opAndVal['operator'], $opAndVal['value'] == 'null' ? null : $opAndVal['value']];
        }
        $builder->$method(...$params);
        return $builder;
    }

    public function scopeOrderThroughRequest(Builder $builder): Builder
    {
        if ($order_by = request('order_by')) {
            if (is_array($order_by)) {
                if (Arr::isAssoc($order_by)) {
                    $key = array_keys($order_by)[0];
                    $value = $order_by[$key];
                    $builder->orderBy(to_snake_case($key), $value ?? 'asc');
                } else {
                    foreach ($order_by as $ob) {
                        if (Arr::isAssoc($ob)) {
                            $key = array_keys($ob)[0];
                            $value = $ob[$key];
                            $builder->orderBy(to_snake_case($key), $value ?? 'asc');
                        } elseif (is_string($ob)) {
                            $builder->orderBy(to_snake_case($ob));
                        }
                    }
                }
            } elseif (is_string($order_by)) {
                $builder->orderBy(to_snake_case($order_by));
            }
        }
        return $builder;
    }

    public function scopeAllThroughRequest(Builder $builder): Builder
    {
        return $builder->allThroughRequest();
    }

    public function init(): void
    {
        $this->casts = collect($this->casts)->merge(['extra' => 'array'])->all();
        $this->handleConveniencesFromRequest();
    }

    public function handleConveniencesFromRequest(): void
    {
        $relationFilters = ['hidden', 'appends', 'with_count', 'with'];
        $table = $this->getTable();
        foreach ($relationFilters as $filter) {
            if ($value = request($table . '.' . $filter)) {
                $field = str($filter)->camel()->replace('_', '');
                $this->{$field} = array_merge($this->{$filter} ?? [], to_snake_case($value));
            }
        }
    }

    public function cashBaseKey(): string
    {
        $key = $this->getTable() . ',route:' . (Route::currentRouteName() ?: Route::currentRouteAction() ?? 'none');

        $relationFilters = ['hidden', 'appends', 'with_count', 'with'];
        $table = $this->getTable();
        foreach ($relationFilters as $filter) {
            if ($value = request($table . '.' . $filter)) {
                $key .= ',' . $filter . ':' . (is_array($value) ? collect($value)->sort()->implode('.') : $value);
            }
        }

        if ($credentials = request()->input('filter_fields')) {
            $credentials = utils()::filterByKeys(array_map('to_snake_case', $credentials), $this->getColumns());
            if ($credentials) {
                $key .= ',filter_fields:' . collect(utils()::sortArrayByKeyThenValue($credentials))->toJson();
            }
        }

        return $key;
    }

}
