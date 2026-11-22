<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Services\Agency\AgentAvailability;
use App\Services\Membership\MembershipCapabilityResolver;
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
 * `manage` (TCK-2592, décision 4) : sur une TÂCHE seulement, le lecteur peut-il la modifier — la
 * règle de `TaskPolicy::update` (créateur membre de l'agence de la fiche, assigné qui en est le
 * personnel, remplaçant d'un assigné absent ; le lecteur d'équipe `crm.view_all` lit sans modifier),
 * jugée pour toute la page en quelques requêtes ({@see self::juges()}). Une visite n'en porte pas :
 * `upcoming_visits[].manage` le dit déjà.
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

    private readonly User $viewer;

    public function __construct(User $viewer, ?CarbonInterface $now = null)
    {
        $this->viewer = $viewer;
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
            // Même règle que `forPage` : hors personnel de l'agence de la fiche, aucune visite ne
            // classe la fiche (sinon le tri trahirait l'heure d'une visite que la page tait).
            ->when(! $this->seesAll, fn (Builder $q) => $this->staffAgencyId === null
                ? $q->whereRaw('1 = 0')
                : $q->whereRaw('customers.agency_id = ?', [$this->staffAgencyId]))
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
     * La prochaine action de chaque fiche de la page, en un nombre de requêtes qui ne dépend ni de sa
     * taille ni du nombre de ses agences (trois, plus celles de `manage` s'il y a une tâche).
     *
     * @param  list<int>  $ids
     * @return array<int, array{type: string, id: int, at: string, label: ?string, overdue: bool, manage?: bool}|null>
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
                // Vérification adverse de TCK-2588 — une visite n'est la prochaine action que pour le
                // personnel de l'agence de la fiche : un bailleur auteur ne lit ni son id ni son
                // heure (la visite peut porter sur le bien d'un autre bailleur).
                if (! $staff) {
                    return;
                }
                $keep((int) $v->customer_id, $v->scheduled_at, 0, [
                    'type' => 'visit',
                    'id' => (int) $v->id,
                    'label' => $v->getAttribute('property_title'),
                ]);
            });

        $juges = null;
        $this->openTasks()
            ->whereIn('tasks.taskable_id', $ids)
            ->get(['tasks.id', 'tasks.taskable_id', 'tasks.due_at', 'tasks.title', 'tasks.created_by_id', 'tasks.assigned_to_id'])
            ->each(function (Task $t) use ($keep, $agencies, &$juges): void {
                $reads = $this->seesAll
                    || (int) $t->created_by_id === $this->viewerId
                    || (int) $t->assigned_to_id === $this->viewerId;
                $juges ??= $this->juges();
                $agencyId = $agencies[$t->taskable_id] ?? null;
                $keep((int) $t->taskable_id, $t->due_at, 1, [
                    'type' => 'task',
                    'id' => (int) $t->id,
                    'label' => $reads ? $t->title : null,
                    'manage' => $this->manages($t, $agencyId === null ? null : (int) $agencyId, $juges),
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
            if (array_key_exists('manage', $entry['row'])) {
                $out[$customerId]['manage'] = $entry['row']['manage'];
            }
        }

        return $out;
    }

    /**
     * Ce que `TaskPolicy::update` lit du lecteur, une fois pour la page : ses agences de membre et de
     * personnel, et les absences qu'il couvre (`AgentAvailability::coveredBy`, mêmes conditions que
     * `covers`). Rien pour le super-admin, qui modifie tout.
     *
     * @return array{member: list<int>, staff: list<int>, covered: array<string, true>}
     */
    private function juges(): array
    {
        if ($this->seesAll) {
            return ['member' => [], 'staff' => [], 'covered' => []];
        }
        $membership = app(MembershipCapabilityResolver::class);
        $staff = $membership->staffAgencyIds($this->viewer);
        $covered = [];
        foreach (app(AgentAvailability::class)->coveredBy($this->viewer) as $absence) {
            $covered[$absence['absent_id'].'@'.$absence['agency_id']] = true;
        }

        return ['member' => $membership->memberAgencyIds($this->viewer), 'staff' => $staff, 'covered' => $covered];
    }

    /**
     * `TaskPolicy::update` pour une tâche d'une fiche de la page (le parent existe : la fiche est
     * lue). Agence nulle : le créateur et l'assigné passent, jamais le remplaçant (`covers` exige une
     * agence).
     *
     * @param  array{member: list<int>, staff: list<int>, covered: array<string, true>}  $juges
     */
    private function manages(Task $t, ?int $agencyId, array $juges): bool
    {
        if ($this->seesAll) {
            return true;
        }
        $creator = (int) $t->created_by_id === $this->viewerId;
        $assignee = $t->assigned_to_id !== null && (int) $t->assigned_to_id === $this->viewerId;

        return ($creator && ($agencyId === null || in_array($agencyId, $juges['member'], true)))
            || ($assignee && ($agencyId === null || in_array($agencyId, $juges['staff'], true)))
            || ($t->assigned_to_id !== null && $agencyId !== null && isset($juges['covered'][$t->assigned_to_id.'@'.$agencyId]));
    }
}
