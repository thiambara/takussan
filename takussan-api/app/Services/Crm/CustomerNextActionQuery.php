<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * TCK-2588 (ADR-0103) — la prochaine action d'une fiche : la plus proche, parmi ses visites à venir
 * (`scheduled` / `confirmed`, pas encore passées) et ses tâches ouvertes à échéance (échues
 * comprises, alors `overdue`). À égalité d'instant, la visite d'abord.
 *
 * `label` : le titre du bien d'une visite, pour le personnel de l'agence de la fiche (et le
 * super-admin) ; le titre d'une tâche, pour son auteur ou son assigné (et le super-admin). Une tâche
 * d'un collègue COMPTE — la fiche est lisible — mais son titre ne sort pas (contrainte du ticket :
 * rien de plus que ce que l'appelant lit déjà). Règle plus étroite que `TaskPolicy::view` (qui
 * admet aussi le remplaçant d'un absent) : jugée sans requête par ligne.
 *
 * UNE définition des deux viviers ({@see self::upcomingVisits()}, {@see self::openTasks()}) : la
 * page et `sort=next_action_at` les lisent tous deux. L'instant est celui de PHP.
 */
final class CustomerNextActionQuery
{
    public const VISIT_STATUSES = [VisitStatus::Scheduled, VisitStatus::Confirmed];

    private readonly CarbonInterface $now;

    private readonly ?int $staffAgencyId;

    private readonly bool $seesAll;

    private readonly int $viewerId;

    public function __construct(User $viewer, ?CarbonInterface $now = null)
    {
        $this->now = Carbon::instance($now ?? now());
        $this->seesAll = $viewer->isSuperAdmin();
        $this->staffAgencyId = $viewer->staffAgencyId();
        $this->viewerId = (int) $viewer->id;
    }

    /** @return Builder<PropertyVisit> */
    public function upcomingVisits(): Builder
    {
        return PropertyVisit::query()
            ->whereIn('property_visits.status', self::VISIT_STATUSES)
            ->where('property_visits.scheduled_at', '>=', $this->now);
    }

    /** @return Builder<Task> */
    public function openTasks(): Builder
    {
        return Task::query()
            ->where('tasks.taskable_type', Customer::class)
            ->whereIn('tasks.status', Task::OPEN_STATUSES)
            ->whereNotNull('tasks.due_at');
    }

    /**
     * L'instant de la prochaine action de la fiche courante (`customers.*`), ou `NULL`.
     *
     * @return array{0: string, 1: list<mixed>}
     */
    public function atSql(): array
    {
        $visit = $this->upcomingVisits()
            ->whereColumn('property_visits.customer_id', 'customers.id')
            ->selectRaw('MIN(property_visits.scheduled_at)')
            ->toBase();
        $task = $this->openTasks()
            ->whereColumn('tasks.taskable_id', 'customers.id')
            ->selectRaw('MIN(tasks.due_at)')
            ->toBase();

        return [
            'LEAST(('.$visit->toSql().'), ('.$task->toSql().'))',
            [...$visit->getBindings(), ...$task->getBindings()],
        ];
    }

    /** `sort=next_action_at` : la plus proche d'abord ; sans action, en dernier, dans les deux sens. */
    public function sort(Builder $query, bool $descending): void
    {
        [$sql, $bindings] = $this->atSql();
        $query->orderByRaw("({$sql}) ".($descending ? 'DESC' : 'ASC').' NULLS LAST', $bindings);
    }

    /**
     * La prochaine action de chaque fiche de la page, en trois requêtes quelle que soit sa taille.
     *
     * @param  list<int>  $ids
     * @return array<int, array{type: string, id: int, at: string, label: ?string, overdue: bool}|null>
     */
    public function forPage(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $agencies = Customer::query()->whereIn('id', $ids)->pluck('agency_id', 'id');

        /** @var array<int, array{at: CarbonInterface, rank: int, row: array<string, mixed>}> $best */
        $best = [];
        $keep = function (int $customerId, CarbonInterface $at, int $rank, array $row) use (&$best): void {
            $current = $best[$customerId] ?? null;
            if ($current === null
                || $at->lessThan($current['at'])
                || ($at->equalTo($current['at']) && [$rank, $row['id']] < [$current['rank'], $current['row']['id']])) {
                $best[$customerId] = ['at' => $at, 'rank' => $rank, 'row' => $row];
            }
        };

        $this->upcomingVisits()
            ->whereIn('property_visits.customer_id', $ids)
            ->leftJoin('properties', 'properties.id', '=', 'property_visits.property_id')
            ->get(['property_visits.id', 'property_visits.customer_id', 'property_visits.scheduled_at', 'properties.title as property_title'])
            ->each(function (PropertyVisit $v) use ($keep, $agencies): void {
                $staff = $this->seesAll
                    || ($this->staffAgencyId !== null && (int) ($agencies[$v->customer_id] ?? 0) === $this->staffAgencyId);
                $keep((int) $v->customer_id, $v->scheduled_at, 0, [
                    'type' => 'visit',
                    'id' => (int) $v->id,
                    'label' => $staff ? $v->getAttribute('property_title') : null,
                ]);
            });

        $this->openTasks()
            ->whereIn('tasks.taskable_id', $ids)
            ->get(['tasks.id', 'tasks.taskable_id', 'tasks.due_at', 'tasks.title', 'tasks.created_by_id', 'tasks.assigned_to_id'])
            ->each(function (Task $t) use ($keep): void {
                $reads = $this->seesAll
                    || (int) $t->created_by_id === $this->viewerId
                    || (int) $t->assigned_to_id === $this->viewerId;
                $keep((int) $t->taskable_id, $t->due_at, 1, [
                    'type' => 'task',
                    'id' => (int) $t->id,
                    'label' => $reads ? $t->title : null,
                ]);
            });

        $out = array_fill_keys($ids, null);
        foreach ($best as $customerId => $entry) {
            $out[$customerId] = [
                'type' => $entry['row']['type'],
                'id' => $entry['row']['id'],
                'at' => $entry['at']->toIso8601String(),
                'label' => $entry['row']['label'],
                'overdue' => $entry['at']->lessThan($this->now),
            ];
        }

        return $out;
    }
}
