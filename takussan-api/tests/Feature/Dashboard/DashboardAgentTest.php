<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for GET /api/dashboard/agent (TCK-032 P1).
 */
class DashboardAgentTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_agent_receives_pipeline_tasks_and_commissions(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->apiActingAsRole('agent', ['agency' => $agency]);

        Customer::factory()->count(2)->create(['agency_id' => $agency->id, 'pipeline_stage' => CustomerPipelineStage::Prospect]);
        Customer::factory()->create(['agency_id' => $agency->id, 'pipeline_stage' => CustomerPipelineStage::Qualified]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        Task::create([
            'title' => 'Follow up client',
            'taskable_type' => Property::class,
            'taskable_id' => $property->id,
            'assigned_to_id' => $agent->id,
            'created_by_id' => $agent->id,
            'status' => TaskStatus::Open,
            'priority' => TaskPriority::Medium,
        ]);

        Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'signed_at' => now(),
            'commission_amount' => 75_000,
        ]);

        $response = $this->apiGet('/api/dashboard/agent')->assertOk();

        $response->assertJsonStructure([
            'data' => [
                'agent_id',
                'agency_id',
                'period' => ['start', 'end'],
                'properties_managed',
                'pipeline',
                'bookings' => ['pending'],
                'visits' => ['upcoming_7d'],
                'finance' => ['commissions_month'],
                'tasks' => ['open', 'overdue', 'today', 'items'],
                'pipeline_ops' => ['pending_bookings', 'leases_to_sign', 'tasks_today'],
                'recent_activity',
                'maintenance' => ['open'],
            ],
        ]);

        $data = $response->json('data');
        $this->assertSame($agent->id, $data['agent_id']);
        $this->assertSame(2, $data['pipeline']['prospect']);
        $this->assertSame(1, $data['pipeline']['qualified']);
        $this->assertGreaterThanOrEqual(1, $data['tasks']['open']);
        $this->assertEquals(75_000.0, $data['finance']['commissions_month']);
    }

    public function test_agent_dashboard_returns_operational_widgets(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->apiActingAsRole('agent', ['agency' => $agency]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id]);

        Task::create([
            'title' => 'Relancer Awa',
            'taskable_type' => Customer::class,
            'taskable_id' => $customer->id,
            'assigned_to_id' => $agent->id,
            'created_by_id' => $agent->id,
            'due_at' => now()->setTime(14, 0),
            'status' => TaskStatus::Open,
            'priority' => TaskPriority::High,
        ]);

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $agent->id,
            'customer_id' => $customer->id,
            'scheduled_at' => now()->setTime(16, 0),
        ]);

        Lease::factory()->create([
            'agency_id' => $agency->id,
            'status' => 'pending_signature',
            'commission_amount' => 120000,
        ]);

        $response = $this->apiGet('/api/dashboard/agent')->assertOk();

        $response->assertJsonPath('data.tasks.today', 1)
            ->assertJsonPath('data.tasks.items.0.title', 'Relancer Awa')
            ->assertJsonPath('data.visits.today', 1)
            ->assertJsonPath('data.pipeline_ops.leases_to_sign', 1)
            ->assertJsonPath('data.recent_activity.0.label', 'Relancer Awa');
    }

    public function test_customer_is_denied(): void
    {
        $this->apiActingAsRole('customer');
        $this->apiGet('/api/dashboard/agent')->assertForbidden();
    }

    public function test_unauthenticated_is_rejected(): void
    {
        $this->apiGet('/api/dashboard/agent')->assertUnauthorized();
    }

    public function test_timeseries_returned_for_agent(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $response = $this->apiGet('/api/dashboard/agent?include=timeseries&months=3')->assertOk();

        $this->assertCount(3, $response->json('timeseries.months'));
        $this->assertCount(3, $response->json('timeseries.commissions'));
        $this->assertCount(3, $response->json('timeseries.signed_leases'));
    }
}
