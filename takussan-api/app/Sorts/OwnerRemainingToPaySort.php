<?php

namespace App\Sorts;

use App\Services\Owners\OwnerDirectory;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2640 — `sort=-remaining_to_pay` du carnet des bailleurs : le reste à verser du mois courant,
 * qui n'est pas une colonne. Il se calcule pour TOUT le périmètre de la requête (pas la seule page)
 * par le relevé servi ({@see OwnerDirectory::remainingToPayIn()}), puis se rejoue en SQL par un
 * `CASE` sur l'id, comme {@see SearchRelevanceSort} : la pagination reste celle de la base. Un
 * profil sans relevé (brouillon) passe en dernier dans les deux sens.
 */
class OwnerRemainingToPaySort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $remaining = array_filter(app(OwnerDirectory::class)->remainingToPayIn($query), fn ($value) => $value !== null);
        if ($remaining === []) {
            return;
        }

        $bindings = [];
        foreach ($remaining as $id => $value) {
            array_push($bindings, (int) $id, (string) $value);
        }

        $query->orderByRaw(
            'CASE owner_profiles.id '.implode(' ', array_fill(0, count($remaining), 'WHEN ? THEN CAST(? AS numeric)')).' ELSE NULL END '
            .($descending ? 'DESC' : 'ASC').' NULLS LAST',
            $bindings,
        );
    }
}
