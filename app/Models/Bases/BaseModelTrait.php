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
     * SCOPE
     */

    public function scopeFilterThroughRequest(Builder $builder): Builder
    {
        if (!empty($credentials = request()->input('filter_fields'))) {
            $c = [];
            foreach ($credentials as $key => $value) {
                $c[to_snake_case($key)] = $value;
            }
            $credentials = utils()::arrayKeyOnlyIncludingEmpty($c, $this->getColumns());
            $this->doFilter($builder, $credentials);
        }
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

    public function applyFilter(Builder $builder, string $key, array $opAndVal, $useAnd = true): Builder
    {
        $method = $useAnd
            ? ($opAndVal['useNot'] ? 'whereNot' : 'where')
            : ($opAndVal['useNot'] ? 'orWhereNot' : 'orWhere');
        $params = [$key, $opAndVal['operator'], $opAndVal['value'] == 'null' ? null : $opAndVal['value']];
        $builder->$method(...$params);
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
            $rest = $a->slice(1)->implode(' ');
            switch ($first) {
                case '@like':
                    return compact('operator', 'rest', 'useNot');
                case '@in' | '@between':
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

    /**
     * Return model columns list
     *
     */
    public function getColumns(): array
    {
        return Schema::getColumnListing($this->getTable());
    }

    public function init(): void
    {
        $this->casts = collect($this->casts)->merge(['extra' => 'array'])->all();
        $this->handleConveniencesFromRequest();
    }

    public function handleConveniencesFromRequest(): void
    {
//        $this->hidden = collect($this->hidden)
//            ->merge(to_snake_case(request($this->getTable().'.hidden', [])))->all();
//
//        $this->appends = collect($this->appends)
//            ->merge(to_snake_case(request($this->getTable().'.appends', [])))->all();
//        $this->withCount = collect($this->withCount)
//            ->merge(to_snake_case(request($this->getTable().'.with_count', [])))->all();
//
//        $this->with = collect($this->with)
//            ->merge(to_snake_case(request($this->getTable().'.with', [])))->all();

        // simplify the code
        $relationFilters = ['hidden', 'appends', 'with_count', 'with'];
        $table = $this->getTable();
        foreach ($relationFilters as $filter) {
            if (($value = request($table.'.'.$filter))) {
                // with_count to withCount
                $field = str($filter)->camel()->replace('_', '');
                $this->{$field} = collect($this->{$filter})->merge(to_snake_case($value))->all();
            }
        }


    }

    public function cashBaseKey(): string
    {
        $key = $this->getTable().',route:'.(Route::currentRouteName() ?: Route::currentRouteAction() ?? 'none');

        $relationFilters = ['hidden', 'appends', 'with_count', 'with'];
        $table = $this->getTable();
        foreach ($relationFilters as $filter) {
            if (($value = request($table.'.'.$filter)) && is_array($value)) {
                $key .= ','.$filter.':'.collect($value)->sort()->implode('.');
            } elseif ($value) {
                $key .= ','.$filter.':'.$value;
            }
        }

        if (!empty($credentials = request()->input('filter_fields'))) {
            $c = [];
            foreach ($credentials as $key => $value) {
                $c[to_snake_case($key)] = $value;
            }
            $credentials =
                utils()::sortArrayByKeyThenValue(utils()::arrayKeyOnlyIncludingEmpty($c, $this->getColumns()));
            if ($credentials) {
                $key .= ',filter_fields:'.collect($credentials)->toJson();
            }
        }
        return $key;
    }

}
