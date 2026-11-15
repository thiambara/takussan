<?php

namespace App\Services\Maintenance;

use App\Console\Commands\AutoCloseMaintenanceRequests;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2652 — LES files d'attente d'une intervention : chacun voit d'abord ce qui l'attend, et depuis
 * quand. Une seule table, {@see self::classify()}, d'où dérivent la `file` d'une ligne (ressource), le
 * filtre `filter[file]` et les comptes de `GET /api/maintenance-requests/summary` (expression SQL
 * {@see self::fileExpression()}, construite en parcourant la même table : les deux ne peuvent pas
 * diverger).
 *
 * | Statut                                   | Condition                    | file               | waiting_on |
 * |------------------------------------------|------------------------------|--------------------|------------|
 * | open, acknowledged, assigned, rejected   | sans prestataire             | a_dispatcher       | agency     |
 * | open, acknowledged, assigned             | prestataire, créneau passé   | en_retard          | provider   |
 * | open, acknowledged, assigned             | prestataire, sinon           | en_cours           | provider   |
 * | rejected                                 | prestataire                  | en_cours           | provider   |
 * | quote_requested                          | —                            | en_cours           | provider   |
 * | quote_submitted                          | —                            | en_cours           | agency     |
 * | awaiting_owner                           | —                            | chez_le_bailleur   | owner      |
 * | approved, in_progress                    | créneau passé                | en_retard          | provider   |
 * | approved, in_progress                    | sinon                        | en_cours           | provider   |
 * | completed                                | —                            | a_confirmer        | tenant     |
 * | closed, cancelled                        | —                            | terminees          | none       |
 *
 * Deux lignes complètent la table du ticket, qui ne classait ni `open`/`acknowledged` AVEC un
 * prestataire ni `rejected` avec un prestataire : `MaintenanceRequestService::assign()` ne change
 * pas le statut, et `open` avec un prestataire est l'état ordinaire d'une demande dispatchée (relevé
 * du 2026-11-11). Elle attend le prestataire, comme `assigned`. Un devis refusé (`rejected`) attend
 * un nouveau devis du même prestataire.
 *
 * « Créneau passé » : `scheduled_at` antérieur au début du jour courant à Dakar. `a_accepter` n'est
 * pas une file de la table (elle recoupe `en_cours` et `en_retard`) : c'est un filtre du prestataire,
 * exactement l'ensemble où `abilities.can_accept` est vrai ({@see self::scopeToAccept()}).
 */
final class MaintenanceQueue
{
    public const A_DISPATCHER = 'a_dispatcher';

    public const EN_RETARD = 'en_retard';

    public const CHEZ_LE_BAILLEUR = 'chez_le_bailleur';

    public const EN_COURS = 'en_cours';

    public const A_CONFIRMER = 'a_confirmer';

    public const TERMINEES = 'terminees';

    public const A_ACCEPTER = 'a_accepter';

    /** Les six files exclusives, dans l'ordre où l'agence les lit. */
    public const FILES = [
        self::A_DISPATCHER, self::EN_RETARD, self::CHEZ_LE_BAILLEUR,
        self::EN_COURS, self::A_CONFIRMER, self::TERMINEES,
    ];

    public const WAITING_AGENCY = 'agency';

    public const WAITING_PROVIDER = 'provider';

    public const WAITING_OWNER = 'owner';

    public const WAITING_TENANT = 'tenant';

    public const WAITING_NONE = 'none';

    /** Les états où « J'accepte » n'a plus de sens : le travail est rendu, clos ou annulé. */
    public const NOT_ACCEPTABLE = [MaintenanceStatus::Completed, MaintenanceStatus::Closed, MaintenanceStatus::Cancelled];

    /**
     * LA table. `match` sans `default` : un statut ajouté à l'énumération sans être classé ici lève
     * `UnhandledMatchError`, et `MaintenanceQueueMappingTest` rougit.
     *
     * @return array{0: string, 1: string} [file, waiting_on]
     */
    public static function classify(MaintenanceStatus $status, bool $hasProvider, bool $slotPast): array
    {
        $slot = [$slotPast ? self::EN_RETARD : self::EN_COURS, self::WAITING_PROVIDER];
        $toDispatch = [self::A_DISPATCHER, self::WAITING_AGENCY];

        return match ($status) {
            MaintenanceStatus::Open,
            MaintenanceStatus::Acknowledged,
            MaintenanceStatus::Assigned => $hasProvider ? $slot : $toDispatch,
            MaintenanceStatus::Rejected => $hasProvider ? [self::EN_COURS, self::WAITING_PROVIDER] : $toDispatch,
            MaintenanceStatus::QuoteRequested => [self::EN_COURS, self::WAITING_PROVIDER],
            MaintenanceStatus::QuoteSubmitted => [self::EN_COURS, self::WAITING_AGENCY],
            MaintenanceStatus::AwaitingOwner => [self::CHEZ_LE_BAILLEUR, self::WAITING_OWNER],
            MaintenanceStatus::Approved,
            MaintenanceStatus::InProgress => $slot,
            MaintenanceStatus::Completed => [self::A_CONFIRMER, self::WAITING_TENANT],
            MaintenanceStatus::Closed,
            MaintenanceStatus::Cancelled => [self::TERMINEES, self::WAITING_NONE],
        };
    }

    /** Le début du jour courant à Dakar, au fuseau de l'application : la borne du « créneau passé ». */
    public static function startOfToday(): CarbonImmutable
    {
        return CarbonImmutable::now(MaintenanceRequest::SCHEDULED_TIMEZONE)->startOfDay()->setTimezone(config('app.timezone'));
    }

    public static function slotPast(?CarbonInterface $scheduledAt, ?CarbonInterface $startOfToday = null): bool
    {
        return $scheduledAt !== null && $scheduledAt->lt($startOfToday ?? self::startOfToday());
    }

    /**
     * Les champs de file d'une ligne, sans requête. `null` partout quand une colonne de la table n'a
     * pas été lue (sparse fieldset sans `status`, `assigned_to` ou `scheduled_at`) : une file déduite
     * d'une colonne absente serait fausse, pas vide.
     *
     * @return array{file: ?string, waiting_on: ?string, waiting_since: ?CarbonInterface, slot_overdue_days: ?int, auto_close_at: ?CarbonInterface}
     */
    public static function describe(MaintenanceRequest $mr): array
    {
        $attributes = $mr->getAttributes();
        foreach (['status', 'assigned_to', 'scheduled_at'] as $column) {
            if (! array_key_exists($column, $attributes)) {
                return ['file' => null, 'waiting_on' => null, 'waiting_since' => null, 'slot_overdue_days' => null, 'auto_close_at' => null];
            }
        }

        $status = $mr->status ?? MaintenanceStatus::Open;
        $startOfToday = self::startOfToday();
        [$file, $waitingOn] = self::classify($status, $mr->assigned_to !== null, self::slotPast($mr->scheduled_at, $startOfToday));

        $overdueDays = null;
        if ($file === self::EN_RETARD && $mr->scheduled_at !== null) {
            $slotDay = CarbonImmutable::instance($mr->scheduled_at)->setTimezone(MaintenanceRequest::SCHEDULED_TIMEZONE)->startOfDay();
            $today = $startOfToday->setTimezone(MaintenanceRequest::SCHEDULED_TIMEZONE);
            $overdueDays = (int) $slotDay->diffInDays($today);
        }

        $autoCloseAt = $status === MaintenanceStatus::Completed && $mr->completed_at !== null
            ? CarbonImmutable::instance($mr->completed_at)->addDays(AutoCloseMaintenanceRequests::DEFAULT_DAYS)
            : null;

        return [
            'file' => $file,
            'waiting_on' => $waitingOn,
            'waiting_since' => $mr->queue_entered_at ?? $mr->created_at,
            'slot_overdue_days' => $overdueDays,
            'auto_close_at' => $autoCloseAt,
        ];
    }

    /**
     * L'expression SQL de la file, dérivée de {@see self::classify()} statut par statut : un statut
     * dont la file ne dépend de rien rend une branche, sinon quatre (prestataire × créneau). Sans
     * `ELSE` : un statut inconnu de la table n'est dans aucune file.
     *
     * @return array{0: string, 1: list<mixed>}
     */
    public static function fileExpression(?CarbonInterface $startOfToday = null): array
    {
        $startOfToday ??= self::startOfToday();
        $table = (new MaintenanceRequest)->getTable();
        $status = "{$table}.status";
        $hasProvider = ["{$table}.assigned_to IS NOT NULL", "{$table}.assigned_to IS NULL"];
        $slotPast = [
            "({$table}.scheduled_at IS NOT NULL AND {$table}.scheduled_at < ?)",
            "({$table}.scheduled_at IS NULL OR {$table}.scheduled_at >= ?)",
        ];
        $bound = $startOfToday->toDateTimeString();

        $branches = [];
        $bindings = [];
        foreach (MaintenanceStatus::cases() as $case) {
            $files = [];
            foreach ([true, false] as $provider) {
                foreach ([true, false] as $past) {
                    $files[] = [$provider, $past, self::classify($case, $provider, $past)[0]];
                }
            }

            if (count(array_unique(array_column($files, 2))) === 1) {
                $branches[] = "WHEN {$status} = ? THEN ?";
                array_push($bindings, $case->value, $files[0][2]);

                continue;
            }

            foreach ($files as [$provider, $past, $file]) {
                $branches[] = "WHEN {$status} = ? AND {$hasProvider[$provider ? 0 : 1]} AND {$slotPast[$past ? 0 : 1]} THEN ?";
                array_push($bindings, $case->value, $bound, $file);
            }
        }

        return ['CASE '.implode(' ', $branches).' END', $bindings];
    }

    /**
     * `filter[file]` : une valeur ou une liste à virgules ; une valeur inconnue ne rend rien (comme
     * `filter[due]` des tâches), jamais une erreur.
     *
     * @param  list<string>  $files
     */
    public static function scopeToFiles(Builder $query, array $files, ?User $user): void
    {
        $exclusive = array_values(array_intersect($files, self::FILES));
        $toAccept = in_array(self::A_ACCEPTER, $files, true) && $user !== null;

        $query->where(function (Builder $any) use ($exclusive, $toAccept, $user): void {
            $any->whereRaw('1 = 0');
            if ($exclusive !== []) {
                [$sql, $bindings] = self::fileExpression();
                $placeholders = implode(', ', array_fill(0, count($exclusive), '?'));
                $any->orWhereRaw("({$sql}) IN ({$placeholders})", [...$bindings, ...$exclusive]);
            }
            if ($toAccept) {
                $any->orWhere(fn (Builder $q) => self::scopeToAccept($q, $user));
            }
        });
    }

    /**
     * `a_accepter` : assignée à l'appelant, pas encore acceptée, ni rendue ni close ni annulée — le
     * même ensemble que `abilities.can_accept` (TCK-2652, AC3).
     */
    public static function scopeToAccept(Builder $query, User $user): void
    {
        $table = $query->getModel()->getTable();
        $query->where("{$table}.assigned_to", $user->id)
            ->whereNull("{$table}.accepted_at")
            ->whereNotIn("{$table}.status", array_map(static fn (MaintenanceStatus $s): string => $s->value, self::NOT_ACCEPTABLE));
    }

    /**
     * Les comptes par file d'une requête déjà bornée (portée de l'index, filtres de la requête) : une
     * requête groupée pour les six files, une pour `a_accepter`. Chaque file est présente, à 0 au besoin.
     *
     * @return array<string, int>
     */
    public static function counts(Builder $scoped, User $user): array
    {
        [$sql, $bindings] = self::fileExpression();

        $rows = (clone $scoped)->toBase()
            ->reorder()
            ->selectRaw("({$sql}) as queue_file, count(*) as aggregate", $bindings)
            ->groupByRaw('1')
            ->pluck('aggregate', 'queue_file');

        $counts = [];
        foreach (self::FILES as $file) {
            $counts[$file] = (int) ($rows[$file] ?? 0);
        }

        $toAccept = clone $scoped;
        self::scopeToAccept($toAccept, $user);
        $counts[self::A_ACCEPTER] = $toAccept->toBase()->reorder()->count();

        return $counts;
    }
}
