<?php

namespace App\Support\Query;

use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Includes\IncludeInterface;

/**
 * TCK-2589 — `include=bookingsCount` / `include=leasesCount` sur une fiche client : le compte des
 * lignes liées qui appartiennent à l'agence DE LA FICHE (`<table>.agency_id = customers.agency_id`),
 * jamais celles qu'une autre agence aurait rattachées au même identifiant. Le compte est rendu sous
 * le nom que spatie lui aurait donné (`bookings_count`, `leases_count`).
 */
final class CompteDansLAgenceDeLaFiche implements IncludeInterface
{
    public function __construct(private readonly string $relation) {}

    public function __invoke(Builder $query, string $include): void
    {
        $related = $query->getModel()->{$this->relation}()->getRelated()->getTable();
        $parent = $query->getModel()->getTable();

        $query->withCount([
            $this->relation => fn (Builder $q) => $q->whereColumn("{$related}.agency_id", "{$parent}.agency_id"),
        ]);
    }
}
