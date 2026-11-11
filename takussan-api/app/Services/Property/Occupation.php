<?php

namespace App\Services\Property;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Services\Dashboard\PortfolioMetrics;
use Illuminate\Contracts\Database\Query\Builder as QueryContract;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2640 — « ce bien est occupé aujourd'hui », en une clause réutilisable : un bail EN COURS
 * ({@see Lease::ONGOING_STATUSES} : `active`, `terminating`), non supprimé, commencé, et ni échu ni
 * résilié (`LEAST(end_date, terminated_at)`). C'est la règle de l'occupation du tableau de bord
 * (TCK-2626, {@see PortfolioMetrics::longStayOccupancyToday()}), écrite là en SQL brut.
 *
 * Posée ici pour que la liste des bailleurs (TCK-2640) et l'occupation des biens (TCK-2637) la
 * lisent au même endroit.
 *
 * TCK-2637 — la règle se lit désormais au niveau du BAIL ({@see self::occupying()}), et le bail
 * COURANT d'un bien en découle ({@see self::current()}) : parmi les baux qui l'occupent, le plus
 * récent (`start_date`, puis `id`) — un bien loué par lots relève de l'immeuble, hors périmètre.
 * `Property::currentLease()`, les filtres `occupancy`, `tenant`, `rent_late`, le tri `retard` et
 * `portfolio-summary` lisent tous ces deux clauses.
 */
final class Occupation
{
    /**
     * TCK-2637 — `vacant_since` : la fin effective d'un bail, sa résiliation sinon son terme.
     * `%1$s` est la table ou l'alias du bail.
     */
    private const EFFECTIVE_END_SQL = 'COALESCE(%1$s.terminated_at::date, %1$s.end_date)';

    /** TCK-2637 — un bail qui n'a jamais commencé ne rend pas un bien vacant « depuis » sa fin. */
    private const NEVER_STARTED_STATUSES = [LeaseStatus::Draft->value, LeaseStatus::PendingSignature->value];

    /**
     * `EXISTS` d'un bail qui occupe le bien de la colonne `$propertyIdColumn` aujourd'hui.
     *
     * @param  string  $propertyIdColumn  colonne qualifiée (`properties.id`)
     */
    public static function whereOccupied(Builder $query, string $propertyIdColumn): Builder
    {
        return $query->whereExists(fn (Builder $leases) => self::occupying($leases->selectRaw('1')->from('leases'))
            ->whereColumn('leases.property_id', $propertyIdColumn));
    }

    /**
     * TCK-2637 — les baux qui occupent leur bien aujourd'hui, sur une requête de `$table`.
     *
     * @template TBuilder of QueryContract
     *
     * @param  TBuilder  $leases
     * @return TBuilder
     */
    public static function occupying(QueryContract $leases, string $table = 'leases'): QueryContract
    {
        $today = now()->toDateString();

        return $leases->whereNull("{$table}.deleted_at")
            ->whereIn("{$table}.status", Lease::ONGOING_STATUSES)
            ->whereDate("{$table}.start_date", '<=', $today)
            ->whereRaw("COALESCE(LEAST({$table}.end_date, {$table}.terminated_at::date), ?::date) >= ?::date", [$today, $today]);
    }

    /**
     * TCK-2637 — le bail COURANT de son bien : il l'occupe, et aucun bail qui l'occupe aussi n'est
     * plus récent (`(start_date, id)` plus grand). Un seul par bien, par construction.
     *
     * @template TBuilder of QueryContract
     *
     * @param  TBuilder  $leases
     * @return TBuilder
     */
    public static function current(QueryContract $leases, string $table = 'leases'): QueryContract
    {
        return self::occupying($leases, $table)
            ->whereNotExists(fn (Builder $newer) => self::occupying($newer->selectRaw('1')->from('leases as newer'), 'newer')
                ->whereColumn('newer.property_id', "{$table}.property_id")
                ->whereRaw("(newer.start_date, newer.id) > ({$table}.start_date, {$table}.id)"));
    }

    /**
     * TCK-2637 — un bail courant en PRÉAVIS : `terminating`, ou une sortie anticipée demandée.
     *
     * @template TBuilder of QueryContract
     *
     * @param  TBuilder  $leases
     * @return TBuilder
     */
    public static function onNotice(QueryContract $leases, string $table = 'leases'): QueryContract
    {
        return $leases->where(fn ($q) => $q->where("{$table}.status", LeaseStatus::Terminating->value)
            ->orWhereNotNull("{$table}.early_termination_requested_at"));
    }

    /** TCK-2637 — {@see self::onNotice()} sur un bail déjà chargé. */
    public static function isOnNotice(Lease $lease): bool
    {
        return $lease->status === LeaseStatus::Terminating || $lease->early_termination_requested_at !== null;
    }

    /**
     * TCK-2637 — la date de fin du dernier bail d'un bien qui a commencé (`vacant_since`), en
     * sous-requête scalaire corrélée à `$propertyIdColumn` : `null` pour un bien jamais loué.
     */
    public static function lastEnd(string $propertyIdColumn): Builder
    {
        return self::started(DB::query()->from('leases as ended'), 'ended')
            ->selectRaw('MAX('.sprintf(self::EFFECTIVE_END_SQL, 'ended').')')
            ->whereColumn('ended.property_id', $propertyIdColumn);
    }

    /**
     * TCK-2637 — la même date pour une page de biens, en une requête : `[property_id => 'Y-m-d']`.
     *
     * @param  list<int>  $propertyIds
     * @return array<int, string>
     */
    public static function lastEnds(array $propertyIds): array
    {
        if ($propertyIds === []) {
            return [];
        }

        return self::started(DB::query()->from('leases as ended'), 'ended')
            ->whereIn('ended.property_id', $propertyIds)
            ->groupBy('ended.property_id')
            ->selectRaw('ended.property_id, MAX('.sprintf(self::EFFECTIVE_END_SQL, 'ended').') AS last_end')
            ->pluck('last_end', 'property_id')
            ->filter()
            ->map(fn ($date) => substr((string) $date, 0, 10))
            ->all();
    }

    private static function started(Builder $leases, string $table): Builder
    {
        return $leases->whereNull("{$table}.deleted_at")
            ->whereNotIn("{$table}.status", self::NEVER_STARTED_STATUSES)
            ->whereDate("{$table}.start_date", '<=', now()->toDateString());
    }
}
