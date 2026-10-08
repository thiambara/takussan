<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Agent-facing dashboard — CRM pipeline, commissions and pending tasks.
 *
 * TCK-595 (ADR-0049) — deux périmètres, et le mot « mes » ne ment plus :
 *  - `mine` : les biens dont l'agent est `user_id` ou collaborateur `agent|manager` (sans condition
 *    d'`accepted_at`, que rien n'écrit), les clients qu'il a ajoutés, les baux à signer qu'il négocie
 *    (`leases.agent_id`) et SES lignes du grand livre ;
 *  - `agency` : toute l'agence, sous `reports.view_agency` (le contrôleur l'autorise), avec la règle
 *    de la tuile d'agence pour les commissions (ADR-0049 §5).
 *
 * Les tâches, visites et interventions restent personnelles dans les deux périmètres. L'ancien
 * calcul rendait à tout agent le chiffre de l'agence sous le libellé « Mes commissions ».
 */
class DashboardAgentService
{
    public const SCOPE_MINE = 'mine';

    public const SCOPE_AGENCY = 'agency';

    public function summary(User $agent, string $scope = self::SCOPE_MINE, ?int $agencyId = null): array
    {
        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();
        $agency = $scope === self::SCOPE_AGENCY && $agencyId !== null;

        $managedPropertyIds = $this->propertyScope($agent, $scope, $agencyId)->pluck('properties.id');

        $propertiesManaged = $managedPropertyIds->count();

        $pipelineScope = Customer::query();
        if ($agency) {
            $pipelineScope->where('agency_id', $agencyId);
        } else {
            $pipelineScope->where('added_by_id', $agent->id)
                ->when($agencyId !== null, fn ($q) => $q->where('agency_id', $agencyId));
        }

        // Single grouped COUNT instead of one query per pipeline stage
        // (mirrors PipelineStatsService::stageCounts).
        $stageCounts = (clone $pipelineScope)
            ->selectRaw('pipeline_stage, COUNT(*) as total')
            ->groupBy('pipeline_stage')
            ->pluck('total', 'pipeline_stage')
            ->toArray();

        $pipeline = [];
        foreach (CustomerPipelineStage::cases() as $stage) {
            $pipeline[$stage->value] = (int) ($stageCounts[$stage->value] ?? 0);
        }

        $pendingBookings = Booking::whereIn('property_id', $managedPropertyIds)
            ->where('status', BookingStatus::Pending)
            ->count();

        // Une visite confirmée est à venir autant qu'une visite planifiée.
        $upcomingVisits = PropertyVisit::where('agent_id', $agent->id)
            ->whereIn('status', [VisitStatus::Scheduled->value, VisitStatus::Confirmed->value])
            ->whereBetween('scheduled_at', [now(), now()->addDays(7)])
            ->count();

        $leasesToSign = $agencyId === null ? 0 : Lease::query()
            ->where('agency_id', $agencyId)
            ->where('status', LeaseStatus::PendingSignature->value)
            ->when(! $agency, fn ($q) => $q->where('agent_id', $agent->id))
            ->count();

        if ($agency) {
            $commissionsMonth = DashboardAgencyService::commissionBetween($agencyId, $monthStart, $monthEnd);
            $commissionsYear = DashboardAgencyService::commissionBetween($agencyId, now()->startOfYear(), now()->endOfYear());
        } else {
            $commissionsMonth = $this->ledgerTotal($agent, $agencyId, $monthStart, $monthEnd);
            $commissionsYear = $this->ledgerTotal($agent, $agencyId, now()->startOfYear(), now()->endOfYear());
        }

        // Tasks owned by the agent
        $openTasks = Task::where('assigned_to_id', $agent->id)
            ->whereIn('status', [TaskStatus::Open, TaskStatus::InProgress])
            ->count();

        $overdueTasks = Task::where('assigned_to_id', $agent->id)
            ->whereIn('status', [TaskStatus::Open, TaskStatus::InProgress])
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->count();

        $tasksToday = Task::where('assigned_to_id', $agent->id)
            ->whereIn('status', [TaskStatus::Open, TaskStatus::InProgress])
            ->whereDate('due_at', today())
            ->count();

        $taskList = Task::where('assigned_to_id', $agent->id)
            ->whereIn('status', [TaskStatus::Open, TaskStatus::InProgress])
            ->with('taskable')
            ->orderByRaw('due_at IS NULL, due_at asc')
            ->orderByDesc('priority')
            ->limit(5)
            ->get()
            ->map(fn (Task $task) => [
                'id' => $task->id,
                'title' => $task->title,
                'priority' => $task->priority?->value,
                'due_at' => $task->due_at?->toIso8601String(),
                'customer' => $task->taskable instanceof Customer
                    ? [
                        'id' => $task->taskable->id,
                        'name' => $task->taskable->full_name,
                    ]
                    : null,
            ])
            ->values()
            ->all();

        $visitsToday = PropertyVisit::where('agent_id', $agent->id)
            ->whereDate('scheduled_at', today())
            ->whereNotIn('status', [VisitStatus::Cancelled->value, VisitStatus::NoShow->value])
            ->with(['property:id,title', 'customer:id,first_name,last_name'])
            ->orderBy('scheduled_at')
            ->limit(5)
            ->get()
            ->map(fn (PropertyVisit $visit) => [
                'id' => $visit->id,
                'scheduled_at' => $visit->scheduled_at?->toIso8601String(),
                'status' => $visit->status?->value,
                'property' => $visit->property
                    ? ['id' => $visit->property->id, 'title' => $visit->property->title]
                    : null,
                'requester' => $visit->customer
                    ? ['id' => $visit->customer->id, 'name' => $visit->customer->full_name]
                    : ['name' => $visit->visitor_name],
            ])
            ->values()
            ->all();

        $recentActivity = Task::where('assigned_to_id', $agent->id)
            ->latest('updated_at')
            ->limit(5)
            ->get()
            ->map(fn (Task $task) => [
                'id' => $task->id,
                'label' => $task->title,
                'type' => 'task',
                'at' => $task->updated_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $openMaintenance = MaintenanceRequest::where('assigned_to', $agent->id)
            ->whereIn('status', [MaintenanceStatus::Open, MaintenanceStatus::InProgress])
            ->count();

        return [
            'agent_id' => $agent->id,
            'agency_id' => $agencyId,
            'scope' => $agency ? self::SCOPE_AGENCY : self::SCOPE_MINE,
            'period' => [
                'start' => $monthStart->toIso8601String(),
                'end' => $monthEnd->toIso8601String(),
            ],
            'properties_managed' => $propertiesManaged,
            'pipeline' => $pipeline,
            'bookings' => [
                'pending' => $pendingBookings,
            ],
            'visits' => [
                'upcoming_7d' => $upcomingVisits,
                'today' => count($visitsToday),
                'today_items' => $visitsToday,
            ],
            'finance' => [
                'commissions_month' => round($commissionsMonth, 2),
                'commissions_year' => round($commissionsYear, 2),
            ],
            'tasks' => [
                'open' => $openTasks,
                'overdue' => $overdueTasks,
                'today' => $tasksToday,
                'items' => $taskList,
            ],
            'pipeline_ops' => [
                'pending_bookings' => $pendingBookings,
                'leases_to_sign' => $leasesToSign,
                'tasks_today' => $tasksToday,
            ],
            'recent_activity' => $recentActivity,
            'maintenance' => [
                'open' => $openMaintenance,
            ],
        ];
    }

    /**
     * Une requête groupée par série, quel que soit `months` : commissions (grand livre pour `mine`,
     * la base de chaque bail activé pour `agency`, figée au grand livre dès qu'il y a une ligne) et baux signés.
     */
    public function monthlyTimeseries(User $agent, int $months = 12, string $scope = self::SCOPE_MINE, ?int $agencyId = null): array
    {
        $months = max(1, min($months, 36));
        $start = now()->subMonths($months - 1)->startOfMonth();
        $end = now()->endOfMonth();
        $agency = $scope === self::SCOPE_AGENCY && $agencyId !== null;

        $labels = [];
        for ($i = 0; $i < $months; $i++) {
            $labels[] = $start->copy()->addMonths($i)->format('Y-m');
        }

        $signed = Lease::query()
            ->whereBetween('signed_at', [$start, $end])
            ->whereNotIn('status', [LeaseStatus::Draft->value, LeaseStatus::PendingSignature->value])
            ->when($agencyId !== null, fn ($q) => $q->where('agency_id', $agencyId))
            ->when(! $agency, fn ($q) => $q->where('agent_id', $agent->id));

        if ($agency) {
            $commissionRows = DB::query()
                ->fromSub(DashboardAgencyService::commissionBasesBetween($agencyId, $start, $end), 'bases')
                ->selectRaw("to_char(signed_at, 'YYYY-MM') AS m, COALESCE(SUM(base), 0) AS v")
                ->groupBy('m')->pluck('v', 'm');
        } else {
            $commissionRows = CommissionEntry::query()
                ->where('beneficiary_id', $agent->id)
                ->where('status', '!=', CommissionEntryStatus::Cancelled->value)
                ->whereBetween('earned_at', [$start, $end])
                ->when($agencyId !== null, fn ($q) => $q->where('agency_id', $agencyId))
                ->toBase()
                ->selectRaw("to_char(earned_at, 'YYYY-MM') AS m, COALESCE(SUM(amount), 0) AS v")
                ->groupBy('m')->pluck('v', 'm');
        }

        $signedRows = $signed->toBase()
            ->selectRaw("to_char(signed_at, 'YYYY-MM') AS m, COUNT(*) AS v")
            ->groupBy('m')->pluck('v', 'm');

        return [
            'months' => $labels,
            'commissions' => array_map(fn (string $m) => round((float) ($commissionRows[$m] ?? 0), 2), $labels),
            'signed_leases' => array_map(fn (string $m) => (int) ($signedRows[$m] ?? 0), $labels),
        ];
    }

    /**
     * Les biens du périmètre : toute l'agence, ou ceux dont l'agent est `user_id` ou collaborateur
     * `agent|manager` — dans son agence active quand il en a une.
     *
     * @return Builder<Property>
     */
    private function propertyScope(User $agent, string $scope, ?int $agencyId): Builder
    {
        if ($scope === self::SCOPE_AGENCY && $agencyId !== null) {
            return Property::query()->where('agency_id', $agencyId);
        }

        return Property::query()
            ->when($agencyId !== null, fn ($q) => $q->where('agency_id', $agencyId))
            ->where(fn ($q) => $q->where('user_id', $agent->id)
                ->orWhereIn('id', PropertyCollaborator::query()
                    ->select('property_id')
                    ->where('user_id', $agent->id)
                    ->whereIn('role', [CollaboratorRole::Agent->value, CollaboratorRole::Manager->value])));
    }

    /** Σ des lignes du grand livre de l'agent sur la période, hors lignes annulées. */
    private function ledgerTotal(User $agent, ?int $agencyId, CarbonInterface $from, CarbonInterface $to): float
    {
        return round((float) CommissionEntry::query()
            ->where('beneficiary_id', $agent->id)
            ->where('status', '!=', CommissionEntryStatus::Cancelled->value)
            ->whereBetween('earned_at', [$from, $to])
            ->when($agencyId !== null, fn ($q) => $q->where('agency_id', $agencyId))
            ->sum('amount'), 2);
    }
}
