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
        if ($agent->agency_id) {
            $commissionsMonth = (float) Lease::where('agency_id', $agent->agency_id)
                ->whereNotNull('signed_at')
                ->whereBetween('signed_at', [$monthStart, $monthEnd])
                ->whereNotIn('status', [LeaseStatus::Draft, LeaseStatus::PendingSignature, LeaseStatus::Terminated])
                ->sum('commission_amount');
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
            ],
            'finance' => [
                'commissions_month' => round($commissionsMonth, 2),
            ],
            'tasks' => [
                'open' => $openTasks,
                'overdue' => $overdueTasks,
            ],
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
