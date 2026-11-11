<?php

namespace App\Sorts;

use App\Models\Enums\LeaseStatus;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2642 (P3 de l'audit des baux) — `sort=etat` : les baux EN COURS d'abord (actif, en préavis),
 * puis ceux qui attendent une signature, les brouillons, et les baux finis ; le tri par défaut de
 * `GET /api/leases` (`etat,-created_at`), pour qu'un brouillon ne passe plus devant les baux qui
 * vivent. Même forme que {@see ThresholdAlertSeveritySort} : un rang, jamais la chaîne.
 */
class LeaseStatusRankSort implements Sort
{
    /** @var list<LeaseStatus> dans l'ordre de la liste */
    public const RANGS = [
        LeaseStatus::Active, LeaseStatus::Terminating, LeaseStatus::PendingSignature, LeaseStatus::Draft,
        LeaseStatus::Expired, LeaseStatus::Terminated, LeaseStatus::Renewed,
    ];

    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $sql = 'CASE '.$query->qualifyColumn('status').' '.implode(' ', array_fill(0, count(self::RANGS), 'WHEN ? THEN ?'))
            .' ELSE '.count(self::RANGS).' END '.($descending ? 'DESC' : 'ASC');
        $bindings = [];
        foreach (self::RANGS as $rang => $status) {
            array_push($bindings, $status->value, $rang < 2 ? 0 : $rang - 1);
        }

        $query->orderByRaw($sql, $bindings);
    }
}
