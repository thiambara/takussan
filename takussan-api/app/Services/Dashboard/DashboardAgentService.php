<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;

/**
 * Agent-facing dashboard — CRM pipeline, commissions and pending tasks.
 */
class DashboardAgentService
{
    public function summary(User $agent): array
    {
        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();

        $managedPropertyIds = Property::where('user_id', $agent->id)
            ->orWhere(function ($q) use ($agent) {
                if ($agent->agency_id) {
                    $q->where('agency_id', $agent->agency_id);
                }
            })
            ->pluck('id');

        $propertiesManaged = $managedPropertyIds->count();

        // CRM pipeline breakdown scoped to customers the agent added OR in agency.
        $pipelineScope = Customer::query();
        if ($agent->agency_id) {
            $pipelineScope->where(function ($q) use ($agent) {
                $q->where('agency_id', $agent->agency_id)->orWhere('added_by_id', $agent->id);
            });
        } else {
            $pipelineScope->where('added_by_id', $agent->id);
        }

        $pipeline = [];
        foreach (CustomerPipelineStage::cases() as $stage) {
            $pipeline[$stage->value] = (clone $pipelineScope)->where('pipeline_stage', $stage)->count();
        }

        // Bookings pipeline
        $pendingBookings = Booking::whereIn('property_id', $managedPropertyIds)
            ->where('status', BookingStatus::Pending)
            ->count();

        $upcomingVisits = PropertyVisit::where('agent_id', $agent->id)
            ->where('status', VisitStatus::Scheduled)
            ->whereBetween('scheduled_at', [now(), now()->addDays(7)])
            ->count();

        // Commissions earned by agent's agency this month (proxy metric).
        $commissionsMonth = 0.0;
        $commissionsYear = 0.0;
        $leasesToSign = 0;
        if ($agent->agency_id) {
            $commissionsMonth = (float) Lease::where('agency_id', $agent->agency_id)
                ->whereNotNull('signed_at')
                ->whereBetween('signed_at', [$monthStart, $monthEnd])
                ->whereNotIn('status', [LeaseStatus::Draft, LeaseStatus::PendingSignature, LeaseStatus::Terminated])
                ->sum('commission_amount');
            $commissionsYear = (float) Lease::where('agency_id', $agent->agency_id)
                ->whereNotNull('signed_at')
                ->whereYear('signed_at', now()->year)
                ->whereNotIn('status', [LeaseStatus::Draft, LeaseStatus::PendingSignature, LeaseStatus::Terminated])
                ->sum('commission_amount');
            $leasesToSign = Lease::where('agency_id', $agent->agency_id)
                ->where('status', LeaseStatus::PendingSignature)
                ->count();
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
            'agency_id' => $agent->agency_id,
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

    public function monthlyTimeseries(User $agent, int $months = 12): array
    {
        $months = max(1, min($months, 36));
        $start = now()->subMonths($months - 1)->startOfMonth();

        $labels = [];
        $commissions = [];
        $signedLeases = [];

        for ($i = 0; $i < $months; $i++) {
            $cursor = (clone $start)->addMonths($i);
            $from = $cursor->copy()->startOfMonth();
            $to = $cursor->copy()->endOfMonth();

            $labels[] = $from->format('Y-m');

            if ($agent->agency_id) {
                $commission = (float) Lease::where('agency_id', $agent->agency_id)
                    ->whereNotNull('signed_at')
                    ->whereBetween('signed_at', [$from, $to])
                    ->whereNotIn('status', [LeaseStatus::Draft, LeaseStatus::PendingSignature, LeaseStatus::Terminated])
                    ->sum('commission_amount');

                $leases = Lease::where('agency_id', $agent->agency_id)
                    ->whereNotNull('signed_at')
                    ->whereBetween('signed_at', [$from, $to])
                    ->count();
            } else {
                $commission = 0.0;
                $leases = 0;
            }

            $commissions[] = round($commission, 2);
            $signedLeases[] = $leases;
        }

        return [
            'months' => $labels,
            'commissions' => $commissions,
            'signed_leases' => $signedLeases,
        ];
    }
}
