<?php

namespace App\Sorts;

use App\Models\UserCustomerRelationship;
use App\Services\Crm\CustomerCommercialAttributes;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2889 — `sort=referent` : par le nom affiché du référent de la fiche, en `COLLATE "und-x-icu"`
 * comme {@see CollatedNameSort} (sous `--locale=C`, « awa » passerait après « Khady »).
 *
 * Le référent est celui que rend l'attribut `referent` ({@see CustomerCommercialAttributes::referents()}) :
 * la relation de {@see CustomerCommercialAttributes::asReferent()} (celle de `filter[referent]`) de plus
 * petit identifiant dont le compte n'est pas supprimé. Lu par une sous-requête corrélée : le tri
 * n'ajoute aucune requête. Les fiches sans référent vont en dernier dans les deux sens.
 */
class CustomerReferentSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $nom = CustomerCommercialAttributes::asReferent(UserCustomerRelationship::query())
            ->join('users', 'users.id', '=', 'user_customer_relationships.user_id')
            ->whereNull('users.deleted_at')
            ->whereColumn('user_customer_relationships.customer_id', 'customers.id')
            ->orderBy('user_customer_relationships.id')
            ->limit(1)
            ->selectRaw("TRIM(CONCAT(\"users\".\"first_name\", ' ', \"users\".\"last_name\"))")
            ->toBase();

        $query->orderByRaw(
            '('.$nom->toSql().') COLLATE "und-x-icu" '.($descending ? 'DESC' : 'ASC').' NULLS LAST',
            $nom->getBindings(),
        );
        // `NULLS LAST` clôt le SQL : `DepartageQueryBuilder`, qui lit le sens à la fin, départagerait
        // toujours en croissant. Le départage est donc posé ici, dans le sens du tri.
        $query->orderBy('customers.id', $descending ? 'desc' : 'asc');
    }
}
