<?php

namespace App\Services\Property;

use App\Models\Lease;
use App\Services\Dashboard\PortfolioMetrics;
use Illuminate\Database\Query\Builder;

/**
 * TCK-2640 — « ce bien est occupé aujourd'hui », en une clause réutilisable : un bail EN COURS
 * ({@see Lease::ONGOING_STATUSES} : `active`, `terminating`), non supprimé, commencé, et ni échu ni
 * résilié (`LEAST(end_date, terminated_at)`). C'est la règle de l'occupation du tableau de bord
 * (TCK-2626, {@see PortfolioMetrics::longStayOccupancyToday()}), écrite là en SQL brut.
 *
 * Posée ici pour que la liste des bailleurs (TCK-2640) et l'occupation des biens (TCK-2637) la
 * lisent au même endroit.
 */
final class Occupation
{
    /**
     * `EXISTS` d'un bail qui occupe le bien de la colonne `$propertyIdColumn` aujourd'hui.
     *
     * @param  string  $propertyIdColumn  colonne qualifiée (`properties.id`)
     */
    public static function whereOccupied(Builder $query, string $propertyIdColumn): Builder
    {
        $today = now()->toDateString();

        return $query->whereExists(fn (Builder $leases) => $leases->selectRaw('1')
            ->from('leases')
            ->whereColumn('leases.property_id', $propertyIdColumn)
            ->whereNull('leases.deleted_at')
            ->whereIn('leases.status', Lease::ONGOING_STATUSES)
            ->whereDate('leases.start_date', '<=', $today)
            ->whereRaw('COALESCE(LEAST(leases.end_date, leases.terminated_at::date), ?::date) >= ?::date', [$today, $today]));
    }
}
