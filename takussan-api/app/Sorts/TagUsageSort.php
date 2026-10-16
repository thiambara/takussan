<?php

namespace App\Sorts;

use App\Models\Tag;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-712 (P02.05) — `sort=usage_count` sur `GET /api/tags`, la valeur même que
 * `TagController::format()` rend sous ce nom : les biens qui portent l'étiquette, plus les clients
 * de l'agence de l'appelant qui la portent. Sans agence, seuls les biens comptent (`usage_count`
 * vaut alors `null` dans la réponse).
 *
 * Les deux comptes sont des sous-requêtes corrélées, bâties par les relations comme `withCount` :
 * PostgreSQL refuse un alias de colonne dans une expression d'`ORDER BY`. À usage égal, le nom
 * départage, pour que les suggestions ne changent pas d'ordre d'un appel à l'autre.
 */
class TagUsageSort implements Sort
{
    public function __construct(private readonly ?int $agencyId) {}

    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $tag = new Tag;

        $proprietes = $tag->properties();
        $comptes = [$proprietes->getRelationExistenceCountQuery($proprietes->getRelated()->newQuery(), $query)->toBase()];

        if ($this->agencyId !== null) {
            $clients = $tag->customers();
            $comptes[] = $clients->getRelationExistenceCountQuery(
                $clients->getRelated()->newQuery()->where('customers.agency_id', $this->agencyId),
                $query,
            )->toBase();
        }

        $sql = implode(' + ', array_map(fn ($c) => '('.$c->toSql().')', $comptes));
        $bindings = array_merge(...array_map(fn ($c) => $c->getBindings(), $comptes));

        $query->orderByRaw('('.$sql.') '.($descending ? 'desc' : 'asc'), $bindings)
            ->orderBy('tags.name');
    }
}
