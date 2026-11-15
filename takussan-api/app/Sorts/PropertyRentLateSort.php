<?php

namespace App\Sorts;

use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Payments\RentMonthStatus;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2637 — `sort=retard` sur la liste des biens : les biens dont le loyer du mois est en retard
 * d'abord ({@see RentMonthStatus::lateOfMonth()}, la règle de `filter[rent_late]` et de
 * `current_month.status = late`), du plus ancien au plus récent (l'échéance la plus ancienne
 * d'abord), puis les autres. `-retard` inverse l'ordre des retards ; les autres biens restent en
 * dernier dans les deux sens.
 *
 * Le retard ne se lit que sur le bail COURANT que l'appelant peut lire (`Lease::scopeVisibleTo`) :
 * sans quoi le rang d'un bien dirait ce que le bloc `occupancy` lui tait.
 */
class PropertyRentLateSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $user = request()->user();
        if ($user === null) {
            return;
        }

        $oldestLate = RentMonthStatus::lateOfMonth(LeasePayment::query())
            ->selectRaw('MIN(lease_payments.due_date)')
            ->whereIn('lease_payments.lease_id', Lease::query()->current()->visibleTo($user)
                ->select('leases.id')
                ->whereColumn('leases.property_id', $query->qualifyColumn('id')))
            ->toBase();

        $query->orderByRaw('('.$oldestLate->toSql().') '.($descending ? 'DESC' : 'ASC').' NULLS LAST', $oldestLate->getBindings());
    }
}
