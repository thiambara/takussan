<?php

namespace App\Models\Bases\Traits;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Laravel\Scout\Searchable;

trait BaseModelTrait
{
    /**
     * Simple filter scope for direct use without request context.
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

    /**
     * Restrict an Eloquent query to ids produced by a Scout full-text search.
     *
     * Composes Scout + subsequent query-scope / spatie-query-builder filtering.
     * Usage:
     *   Property::query()->withSearch($request->input('q'))->public()->paginate();
     *
     * When the term is null/empty or the model is not Searchable, this is a
     * no-op so it is safe to chain unconditionally.
     *
     * Caveats:
     * - A hard `$limit` must be applied to the Scout call; without it, engines
     *   like Meilisearch silently fall back to their own default hitsPerPage
     *   (~20), truncating results. Downstream DB pagination would then page
     *   over that truncated set. The default cap is intentionally generous;
     *   narrow results via additional filters before paginating in the UI.
     * - Scout relevance ordering is *not* preserved on the resulting Eloquent
     *   query. Callers needing relevance-ranked results should use
     *   `Model::search($term)->paginate()` directly instead of this scope.
     */
    public function scopeWithSearch(Builder $query, ?string $term, int $limit = 1000): Builder
    {
        $term = is_string($term) ? trim($term) : '';

        if ($term === '' || ! static::isSearchable()) {
            return $query;
        }

        /** @var class-string<Model> $model */
        $model = static::class;

        $ids = $model::search($term)->take($limit)->keys()->all();

        if (empty($ids)) {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereIn($query->getModel()->getQualifiedKeyName(), $ids);
    }

    /**
     * True when the model uses Laravel Scout's Searchable trait.
     */
    public static function isSearchable(): bool
    {
        return in_array(Searchable::class, class_uses_recursive(static::class), true);
    }
}
