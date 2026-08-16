<?php

namespace App\Models\Concerns;

use App\Http\Filters\RangeFilter;
use App\Sorts\SearchRelevanceSort;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Laravel\Scout\Searchable;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\AllowedInclude;
use Spatie\QueryBuilder\AllowedSort;
use Spatie\QueryBuilder\QueryBuilder;

trait HasQueryBuilder
{
    /**
     * TCK-281 — plafond d'ids ramenés de Scout par `filter[search]`.
     *
     * C'EST UN PLAFOND, ET IL ÉCHOUE EN SILENCE : Meilisearch rend au plus
     * `SEARCH_ID_CAP` ids GLOBAUX, toutes agences confondues, AVANT
     * l'intersection avec le scope tenant du contrôleur. Une correspondance
     * appartenant à l'agence de l'appelant mais classée au-delà de ce rang
     * global disparaît sans message ni compteur tronqué. Le plafond tient à
     * l'échelle actuelle ; il se dégradera d'abord pour les grosses agences.
     */
    protected const SEARCH_ID_CAP = 5000;

    /**
     * TCK-281 — ids Scout de la dernière recherche `filter[search]`, DANS
     * L'ORDRE DE PERTINENCE rendu par Meilisearch, indexés par classe.
     *
     * Le `whereIn` qui compose Scout et Eloquent perd cet ordre ; le conserver
     * ici est ce qui permet à {@see self::defaultSortsWithRelevance()} de le
     * restituer côté SQL. Clé = classe du modèle, parce qu'une propriété
     * statique de trait appartient à la classe QUI UTILISE le trait :
     * `AbstractModel` la porte pour ses 68 descendants, qui partagent donc le
     * même emplacement.
     *
     * @var array<class-string, array<int,int|string>>
     */
    protected static array $searchRelevanceIds = [];

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

    /**
     * TCK-281 — les tris par défaut d'un endpoint de liste, PERTINENCE EN
     * TÊTE quand la requête courante porte un `filter[search]` servi par
     * Meilisearch.
     *
     * À appeler APRÈS `buildQuery()`, qui est ce qui interroge Scout et
     * mémorise l'ordre des ids. Le résultat se passe à `defaultSorts()` et non
     * à `allowedSorts()` : `defaultSorts()` ne fait rien dès qu'un `sort=`
     * explicite est présent, donc un tri demandé par le client reste souverain
     * (AC4) et la pertinence ne s'applique qu'à défaut.
     *
     * @param  string  ...$fallback  Les tris à appliquer hors recherche.
     * @return array<int, AllowedSort|string>
     */
    public static function defaultSortsWithRelevance(string ...$fallback): array
    {
        $ids = static::$searchRelevanceIds[static::class] ?? null;

        // Moins de deux résultats : il n'y a pas d'ordre à restituer, et on
        // évite d'écrire un `CASE` inutile dans le SQL.
        if ($ids === null || count($ids) < 2 || ! SearchRelevanceSort::supports($ids)) {
            return $fallback;
        }

        return [
            AllowedSort::custom('search_relevance', new SearchRelevanceSort($ids)),
            ...$fallback,
        ];
    }

    /** @return array<int, AllowedFilter> */
    protected static function getAllowedQueryFilters(): array
    {
        // L'ordre de pertinence n'appartient qu'à la requête en cours : le
        // reposer ici évite qu'un `buildQuery()` sans recherche hérite de
        // l'ordre du précédent (même processus : Octane, jobs, tests).
        unset(static::$searchRelevanceIds[static::class]);

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
                if (trim($value) === '') {
                    return;
                }

                $model = $q->getModel();

                // TCK-280 — Searchable models go through Scout/Meilisearch
                // (typo-tolerant, relevance-ranked). The resulting whereIn
                // composes with any access-control scope already applied to
                // the query, so tenant isolation is preserved. Non-Searchable
                // models keep the SQL LIKE fallback. Inlined here rather than
                // delegating to BaseModelTrait::withSearch() because
                // HasQueryBuilder is also used by models without that trait
                // (e.g. User).
                if (in_array(Searchable::class, class_uses_recursive($model), true)) {
                    $ids = $model::search($value)->take(static::SEARCH_ID_CAP)->keys()->all();
                    $q->whereIn($model->getQualifiedKeyName(), $ids);

                    // TCK-281 — `whereIn` ne dit rien de l'ordre. On mémorise
                    // le classement de Meilisearch pour que le contrôleur
                    // puisse le restituer via `defaultSortsWithRelevance()` —
                    // sans quoi le `defaultSort('-created_at')` rendrait la
                    // recherche tolérante aux fautes mais classée par date,
                    // c'est-à-dire la moitié de ce qu'AC1 promet.
                    static::$searchRelevanceIds[$model::class] = $ids;

                    return;
                }

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
