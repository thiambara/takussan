<?php

namespace App\Services\Dashboard\Adapters;

use App\Contracts\DashboardMetrics;
use App\Models\User;
use App\Services\Dashboard\DashboardAgentService;

class AgentMeMetrics implements DashboardMetrics
{
    public function __construct(private readonly DashboardAgentService $service) {}

    public function role(): string
    {
        return 'agent';
    }

    public function metrics(User $user): array
    {
        $s = $this->service->summary($user);
        $pipeline = is_array($s['pipeline'] ?? null) ? $s['pipeline'] : [];

        return [
            'properties_managed' => $s['properties_managed'] ?? 0,
            'pipeline_total' => array_sum($pipeline),
            'pipeline_by_stage' => $pipeline,
            'bookings_pending' => $s['bookings']['pending'] ?? 0,
            'visits_upcoming_7d' => $s['visits']['upcoming_7d'] ?? 0,
            'commissions_month' => $s['finance']['commissions_month'] ?? 0.0,
            'tasks_open' => $s['tasks']['open'] ?? 0,
            'tasks_overdue' => $s['tasks']['overdue'] ?? 0,
            'maintenance_open' => $s['maintenance']['open'] ?? 0,
        ];
    }

    public function sections(User $user): array
    {
        return ['pipeline', 'tasks', 'visits'];
    }
}
