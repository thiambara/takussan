<?php

namespace App\Models\Bases;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

abstract class AbstractModel extends Model
{
    /**
     * Apply simple filter operators coming from the request.
     * Supports exact match, null/not null, and `@like` suffix.
     *
     * @param  array<string,mixed>  $filters
     */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        foreach ($filters as $field => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            if (str_ends_with($field, '@like')) {
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
