<?php

namespace App\Http\Includes;

use Closure;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Includes\IncludedRelationship;

/**
 * TCK-665 (piste P03.02) — un `include=` de relation dont les lignes sont bornées à UNE agence.
 *
 * `AllowedInclude::relationship()` charge la relation entière : sur `GET /api/users`, cela livrait
 * à l'admin de l'agence A les profils que la personne tient dans l'agence B. Cette classe charge la
 * même relation, restreinte à `agency_id = $agencyId`, et garde les sparse fieldsets
 * (`fields[<table>]=…`) : elle étend `IncludedRelationship` pour que `AllowedInclude::include()`
 * lui passe le rappel des champs, qu'elle mémorise ici (celui du parent est privé).
 *
 * Relation d'un seul niveau seulement : un chemin `a.b` ne serait borné que sur `a`.
 */
class AgencyScopedRelationship extends IncludedRelationship
{
    private ?Closure $fields = null;

    public function __construct(private readonly int $agencyId) {}

    public function setFieldsCallback(Closure $callback): void
    {
        $this->fields = $callback;
    }

    public function __invoke(Builder $query, string $relationship): void
    {
        $fields = [];
        if ($this->fields) {
            $table = $query->getModel()->{$relationship}()->getRelated()->getTable();
            $fields = ($this->fields)($relationship, $table);
        }

        $agencyId = $this->agencyId;

        $query->with([$relationship => function ($relation) use ($fields, $agencyId) {
            $relation->where($relation->qualifyColumn('agency_id'), $agencyId);

            if ($fields !== []) {
                $relation->select($relation->qualifyColumns($fields));
            }
        }]);
    }
}
