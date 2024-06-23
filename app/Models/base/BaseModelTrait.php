<?php

namespace App\Models\base;


use Illuminate\Broadcasting\Channel;
use Illuminate\Database\Eloquent\BroadcastableModelEventOccurred;
use Illuminate\Database\Eloquent\BroadcastsEvents;
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
    use BroadcastsEvents;

    /**
     * OVERWRITTEN
     */

    /**
     * The model event's broadcast name.
     *
     * @param  string  $event
     * @return string|null
     */
    public function broadcastAs(string $event): ?string
    {

        return $event;
    }

    /**
     * Get the channels that model events should broadcast on.
     *
     * @param  string  $event
     * @return Channel|array
     */
    public function broadcastOn(string $event): Channel|array
    {
        return [new Channel('App.Models.'.class_basename($this))];
    }


    /**
     * Create a new broadcastable model event for the model.
     *
     * @param  string  $event
     * @return BroadcastableModelEventOccurred
     */
    public function newBroadcastableEvent(string $event): BroadcastableModelEventOccurred
    {
        return (new BroadcastableModelEventOccurred(
            $this, $event
        ));
    }

    /**
     * Get the data to broadcast for the model.
     *
     * @param  string  $event
     * @return array
     */
    public function broadcastWith(string $event): array
    {
        return ['model' => $this];
    }


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
                    $first = true;
                    foreach ($value as $val) {
                        if ($val = str($val)->trim()) {
                            $opAndVal = $this->getFilterOpAndValue($val);
                            if ($first) {
                                $this->applyFilter($b, $key, $opAndVal);
                                $first = false;
                            } else {
                                $this->applyFilter($b, $key, $opAndVal, false);
                            }
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

    public function applyFilter(Builder $builder, string $key, array $opAndVal, $userAnd = true): Builder
    {
        if ($userAnd) {
            if ($opAndVal['operator'] == 'in') {
                if ($opAndVal['useNot']) {
                    $builder->whereNotIn($key, $opAndVal['value']);
                } else {
                    $builder->whereIn($key, $opAndVal['value']);
                }
            } else {
                if ($opAndVal['operator'] == 'between') {
                    if ($opAndVal['useNot']) {
                        $builder->whereNotBetween($key, $opAndVal['value']);
                    } else {
                        $builder->whereBetween($key, $opAndVal['value']);
                    }
                } else {
                    $params = [$key, $opAndVal['operator'], $opAndVal['value'] == 'null' ? null : $opAndVal['value']];
                    if ($opAndVal['useNot']) {
                        $builder->whereNot(...$params);
                    } else {
                        $builder->where(...$params);
                    }
                }
            }
        } else {
            if ($opAndVal['operator'] == 'in') {
                if ($opAndVal['useNot']) {
                    $builder->orWhereNotIn($key, $opAndVal['value']);
                } else {
                    $builder->orWhereIn($key, $opAndVal['value']);
                }
            } else {
                if ($opAndVal['operator'] == 'between') {
                    if ($opAndVal['useNot']) {
                        $builder->orWhereNotBetween($key, $opAndVal['value']);
                    } else {
                        $builder->orWhereBetween($key, $opAndVal['value']);
                    }
                } else {
                    $params = [$key, $opAndVal['operator'], $opAndVal['value'] == 'null' ? null : $opAndVal['value']];
                    if ($opAndVal['useNot']) {
                        $builder->orWhereNot(...$params);
                    } else {
                        $builder->orWhere(...$params);
                    }
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
        if ($v->substr(0, 1) == '!') {
            $useNot = true;
            $v = $v->substr(1);
            $value = $v;
        }
        if ($v->split('/\.\./')->count() == 2) {
            $operator = 'between';
            $value = $v->split('/\.\./')->toArray();
        } else {
            if (($a = $v->split('/\s/')) && $a->count() > 1) {
                if (str($a->first())->trim() == '@like') {
                    $operator = 'like';
                    $value = $a->slice(1)->implode(' ');
                } else {
                    if (str($a->first())->trim() == '@in') {
                        $operator = 'in';
                        $value = str($a->last())->split('/,/')->toArray();
                    } else {
                        if (collect(['=', '!=', '<>', '>', '<', '>=', '<='])->contains(str($a->first())->trim())) {
                            $operator = str($a->first())->trim();
                            $value = $a->slice(1)->implode(' ');
                        }
                    }
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
        $relations = $this->relationsToArray();

        $this->hidden = collect($this->hidden)
            ->merge(to_snake_case(request($this->getTable().'.hidden', [])))->intersect($relations)->all();

        $this->appends = collect($this->appends)
            ->merge(to_snake_case(request($this->getTable().'.appends', [])))->intersect($relations)->all();

        $this->withCount = collect($this->withCount)
            ->merge(to_snake_case(request($this->getTable().'.with_count', [])))->intersect($relations)->all();

        $this->with = collect($this->with)
            ->merge(to_snake_case(request($this->getTable().'.with', [])))->intersect($relations)->all();
        // simplify the code
//        $relationFilters = ['hidden', 'appends', 'with_count', 'with'];
//        $table = $this->getTable();
//        foreach ($relationFilters as $filter) {
//            if (($value = request($table.'.'.$filter))) {
//                // with_count to withCount
//                $field = str($filter)->camel()->replace('_', '');
//                $this->{$field} = collect($this->{$filter})->merge(to_snake_case($value))->intersect($relations)->all();
//            }
//        }


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
