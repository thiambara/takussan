<?php

namespace App\Models\Bases\Traits;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Laravel\Scout\Searchable;

/**
 * TCK-307 — `scopeFilter()` a été supprimé d'ici.
 *
 * C'était un DSL de filtrage maison (`->filter(['col' => …, 'col@like' => …])`) monté sur les
 * 68 modèles qui étendent `AbstractModel`. Mesuré le 2026-08-17 : **zéro appelant** dans tout le
 * dépôt — `app/`, `routes/`, `database/`, `bin/`, `config/` — contre 46 `buildQuery()` dans les
 * seuls contrôleurs. Son unique usage était le test qui le testait.
 *
 * Le filtrage d'API passe par `HasQueryBuilder::buildQuery()` et
 * `spatie/laravel-query-builder` — voir `docs/spatie-query-builder.md`. Le motif de la
 * suppression n'est pas la duplication mais l'AMBIGUÏTÉ : deux mécanismes également disponibles
 * sur le même modèle, dont un mort, se lisent comme deux conventions au choix.
 *
 * `scripts/check-filtering-single-mechanism.mjs` garde cette suppression contre un retour, y
 * compris sous un autre nom.
 */
trait BaseModelTrait
{
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
