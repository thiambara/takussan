<?php

namespace App\Services\Crm;

use App\Domain\Settings\EditablePlatformSettings;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Support\ScopedSetting;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * TCK-2588 (ADR-0103 § 4) — la relance due d'une fiche, calculée à la lecture et jamais stockée.
 *
 * Trois sources, et la plus ANCIENNE l'emporte :
 *   · `overdue_task` — une tâche ouverte de la fiche dont l'échéance est passée (depuis l'échéance) ;
 *   · `report_missing` — une visite « À clore » (`PropertyVisit::scopeToClose`, ADR-0101 § 6) :
 *     depuis la fin de la visite, ou son heure si elle n'a pas été déclarée terminée. Les comptes
 *     rendus sont du seul personnel : la raison ne vaut que pour le personnel de l'agence de la
 *     fiche (et le super-admin) ;
 *   · `no_contact` — une fiche d'une étape vivante dont le dernier contact (`last_contacted_at`,
 *     sinon sa création) date d'au moins `crm.follow_up_days` jours : depuis ce dernier contact.
 *
 * Jamais pour une fiche `converted` ou `lost`. `days` compte les jours pleins depuis `since`.
 *
 * UNE définition, en SQL ({@see self::sinceSql()}) : l'attribut de la page, `filter[follow_up]` et
 * `sort=follow_up_days` la lisent tous trois. L'instant est celui de PHP, lié en paramètre : jamais
 * `NOW()` (l'horloge du serveur de base ne voyage pas avec `travelTo`).
 */
final class CustomerFollowUpQuery
{
    public const SETTING_KEY = 'crm.follow_up_days';

    public const DEFAULT_DAYS = 7;

    /** Les étapes vivantes : `filter[stage_group]=active` et la raison `no_contact`. */
    public const LIVE_STAGES = [
        CustomerPipelineStage::Lead,
        CustomerPipelineStage::Prospect,
        CustomerPipelineStage::Qualified,
        CustomerPipelineStage::Negotiating,
    ];

    public const REASONS = ['overdue_task', 'report_missing', 'no_contact'];

    private readonly CarbonInterface $now;

    private readonly ?int $staffAgencyId;

    private readonly bool $seesAll;

    private readonly int $days;

    public function __construct(User $viewer, ?CarbonInterface $now = null)
    {
        $this->now = Carbon::instance($now ?? now());
        $this->seesAll = $viewer->isSuperAdmin();
        $this->staffAgencyId = $viewer->staffAgencyId();
        $this->days = self::thresholdDays($this->staffAgencyId);
    }

    /** Le seuil de l'agence, sinon celui de la plateforme (catalogue, défaut 7). */
    public static function thresholdDays(?int $agencyId): int
    {
        $value = ScopedSetting::value(self::SETTING_KEY, $agencyId,
            app(PlatformSettingService::class)->getValue('crm.follow_up_days'));

        $days = (int) $value;

        return $days >= 1 ? (int) EditablePlatformSettings::clamp(self::SETTING_KEY, $days) : self::DEFAULT_DAYS;
    }

    /** @return list<string> */
    public static function liveStageValues(): array
    {
        return array_map(fn (CustomerPipelineStage $s) => $s->value, self::LIVE_STAGES);
    }

    /**
     * L'instant de la relance de la fiche courante (`customers.*`), ou `NULL`.
     *
     * @return array{0: string, 1: list<mixed>}
     */
    public function sinceSql(): array
    {
        [$parts, $bindings] = $this->partsSql();
        $live = self::liveStageValues();

        return [
            'CASE WHEN customers.pipeline_stage IN ('.implode(', ', array_fill(0, count($live), '?')).') '
                .'THEN LEAST('.implode(', ', $parts).') END',
            [...$live, ...$bindings],
        ];
    }

    /**
     * Les trois sources, chacune un instant ou `NULL`, dans l'ordre de {@see self::REASONS}.
     *
     * @return array{0: list<string>, 1: list<mixed>}
     */
    private function partsSql(): array
    {
        $overdue = Task::query()
            ->where('tasks.taskable_type', Customer::class)
            ->whereColumn('tasks.taskable_id', 'customers.id')
            ->whereIn('tasks.status', Task::OPEN_STATUSES)
            ->where('tasks.due_at', '<', $this->now)
            ->selectRaw('MIN(tasks.due_at)')
            ->toBase();

        $toClose = PropertyVisit::query()
            ->toClose()
            ->whereColumn('property_visits.customer_id', 'customers.id')
            ->selectRaw('MIN(COALESCE(property_visits.completed_at, property_visits.scheduled_at))')
            ->toBase();

        [$staffSql, $staffBindings] = match (true) {
            $this->seesAll => ['TRUE', []],
            $this->staffAgencyId !== null => ['customers.agency_id = ?', [$this->staffAgencyId]],
            default => ['FALSE', []],
        };

        $lastContact = 'COALESCE(customers.last_contacted_at, customers.created_at)';

        return [
            [
                '('.$overdue->toSql().')',
                "CASE WHEN {$staffSql} THEN (".$toClose->toSql().') END',
                "CASE WHEN {$lastContact} <= ? THEN {$lastContact} END",
            ],
            [
                ...$overdue->getBindings(),
                ...$staffBindings,
                ...$toClose->getBindings(),
                $this->now->copy()->subDays($this->days),
            ],
        ];
    }

    /**
     * La relance de chaque fiche de la page, en UNE requête.
     *
     * @param  list<int>  $ids
     * @return array<int, array{reason: string, since: string, days: int}|null>
     */
    public function forPage(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        [$sinceSql, $sinceBindings] = $this->sinceSql();
        [$parts, $partsBindings] = $this->partsSql();

        $rows = Customer::query()
            ->toBase()
            ->whereIn('customers.id', $ids)
            ->select('customers.id')
            ->selectRaw("({$sinceSql}) AS follow_up_since", $sinceBindings)
            ->selectRaw(implode(', ', array_map(
                fn (string $part, string $reason) => "({$part}) AS {$reason}",
                $parts,
                self::REASONS,
            )), $partsBindings)
            ->get();

        $out = array_fill_keys($ids, null);
        foreach ($rows as $row) {
            if ($row->follow_up_since === null) {
                continue;
            }
            $at = Carbon::parse($row->follow_up_since);
            // La raison est la source dont l'instant EST celui de la relance ; à égalité, l'ordre de REASONS.
            $reason = collect(self::REASONS)
                ->first(fn (string $r) => $row->{$r} !== null && Carbon::parse($row->{$r})->equalTo($at));

            $out[(int) $row->id] = [
                'reason' => $reason ?? 'no_contact',
                'since' => $at->toIso8601String(),
                'days' => intdiv(max(0, $this->now->getTimestamp() - $at->getTimestamp()), 86400),
            ];
        }

        return $out;
    }

    /** `filter[follow_up]=0|1`. */
    public function filter(Builder $query, bool $due): void
    {
        [$sql, $bindings] = $this->sinceSql();
        $query->whereRaw("({$sql}) IS ".($due ? 'NOT NULL' : 'NULL'), $bindings);
    }

    /** `sort=-follow_up_days` : la plus en retard (l'instant le plus ancien) d'abord ; sans relance, en dernier. */
    public function sort(Builder $query, bool $mostOverdueFirst): void
    {
        [$sql, $bindings] = $this->sinceSql();
        $query->orderByRaw("({$sql}) ".($mostOverdueFirst ? 'ASC' : 'DESC').' NULLS LAST', $bindings);
    }
}
