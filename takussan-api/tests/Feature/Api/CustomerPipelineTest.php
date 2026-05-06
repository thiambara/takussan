<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerPipelineTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_filters_by_pipeline_stage(): void
    {
        $user = User::factory()->create();
        Customer::factory()->create(['added_by_id' => $user->id, 'pipeline_stage' => CustomerPipelineStage::Lead]);
        Customer::factory()->create(['added_by_id' => $user->id, 'pipeline_stage' => CustomerPipelineStage::Qualified]);
        Customer::factory()->create(['added_by_id' => $user->id, 'pipeline_stage' => CustomerPipelineStage::Qualified]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/customers?'.http_build_query([
            'filter' => ['pipeline_stage' => 'qualified'],
            'fields' => ['customers' => 'id,first_name,last_name,pipeline_stage'],
        ]));

        $response->assertOk();
        $this->assertEquals(2, $response->json('meta.total'));
    }

    public function test_pipeline_stats_returns_four_metrics(): void
    {
        $user = User::factory()->create();
        Customer::factory()->count(3)->create(['added_by_id' => $user->id, 'pipeline_stage' => CustomerPipelineStage::Lead]);
        Customer::factory()->create(['added_by_id' => $user->id, 'pipeline_stage' => CustomerPipelineStage::Qualified]);
        Customer::factory()->create(['added_by_id' => $user->id, 'pipeline_stage' => CustomerPipelineStage::Converted]);
        Customer::factory()->create(['added_by_id' => $user->id, 'pipeline_stage' => CustomerPipelineStage::Lost]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/customers/pipeline-stats')->assertOk();

        $response->assertJsonStructure([
            'data' => [
                'stage_counts',
                'stage_changes_last_30d',
                'avg_time_in_stage',
                'conversion_rate',
            ],
        ]);

        $counts = $response->json('data.stage_counts');
        $this->assertSame(3, $counts['lead']);
        $this->assertSame(1, $counts['qualified']);
        $this->assertSame(1, $counts['converted']);
        $this->assertSame(1, $counts['lost']);

        // Conversion rate = converted / (converted + lost) = 1/2 = 0.5
        $this->assertEquals(0.5, $response->json('data.conversion_rate'));
    }

    public function test_pipeline_stats_scoped_to_agent_only(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();

        Customer::factory()->count(2)->create(['added_by_id' => $alice->id, 'pipeline_stage' => CustomerPipelineStage::Lead]);
        Customer::factory()->count(5)->create(['added_by_id' => $bob->id, 'pipeline_stage' => CustomerPipelineStage::Lead]);

        Sanctum::actingAs($alice);

        $response = $this->getJson('/api/customers/pipeline-stats')->assertOk();
        $this->assertSame(2, $response->json('data.stage_counts.lead'));
    }

    public function test_pipeline_stats_scoped_to_agency_when_user_in_agency(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $colleague = User::factory()->create(['agency_id' => $agency->id]);
        $outsider = User::factory()->create();

        Customer::factory()->create(['added_by_id' => $user->id, 'agency_id' => $agency->id]);
        Customer::factory()->create(['added_by_id' => $colleague->id, 'agency_id' => $agency->id]);
        Customer::factory()->create(['added_by_id' => $outsider->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/customers/pipeline-stats')->assertOk();
        $this->assertSame(2, array_sum($response->json('data.stage_counts')));
    }

    public function test_pipeline_index_and_stats_share_active_agency_scope(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $colleague = User::factory()->create(['agency_id' => $agency->id]);
        $outsider = User::factory()->create();

        $ownLegacy = Customer::factory()->create([
            'added_by_id' => $user->id,
            'agency_id' => null,
            'status' => CustomerStatus::Active,
            'pipeline_stage' => CustomerPipelineStage::Qualified,
        ]);
        $agencyCustomer = Customer::factory()->create([
            'added_by_id' => $colleague->id,
            'agency_id' => $agency->id,
            'status' => CustomerStatus::Active,
            'pipeline_stage' => CustomerPipelineStage::Qualified,
        ]);
        Customer::factory()->create([
            'added_by_id' => $user->id,
            'agency_id' => null,
            'status' => CustomerStatus::Inactive,
            'pipeline_stage' => CustomerPipelineStage::Qualified,
        ]);
        Customer::factory()->create([
            'added_by_id' => $outsider->id,
            'status' => CustomerStatus::Active,
            'pipeline_stage' => CustomerPipelineStage::Qualified,
        ]);

        Sanctum::actingAs($user);

        $index = $this->getJson('/api/customers?'.http_build_query([
            'filter' => ['pipeline_stage' => 'qualified', 'status' => 'active'],
            'fields' => ['customers' => 'id,first_name,last_name,pipeline_stage,status'],
        ]))->assertOk();

        $this->assertEqualsCanonicalizing(
            [$ownLegacy->id, $agencyCustomer->id],
            collect($index->json('data'))->pluck('id')->all(),
        );

        $stats = $this->getJson('/api/customers/pipeline-stats')->assertOk();
        $this->assertSame(2, $stats->json('data.stage_counts.qualified'));
    }

    public function test_pipeline_column_payload_exposes_added_by_and_tasks_count(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create([
            'agency_id' => $agency->id,
            'first_name' => 'Aminata',
            'last_name' => 'Fall',
        ]);
        $customer = Customer::factory()->create([
            'added_by_id' => $agent->id,
            'agency_id' => $agency->id,
            'pipeline_stage' => CustomerPipelineStage::Lead,
            'status' => CustomerStatus::Active,
        ]);
        Task::factory()->forCustomer($customer)->create(['assigned_to_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $response = $this->getJson('/api/customers?'.http_build_query([
            'filter' => ['pipeline_stage' => 'lead', 'status' => 'active'],
            'include' => 'addedBy,tasksCount',
            'fields' => [
                'customers' => 'id,first_name,last_name,pipeline_stage,updated_at,created_at,added_by_id',
                'users' => 'id,first_name,last_name',
            ],
        ]));

        $response->assertOk();

        $response
            ->assertJsonPath('data.0.id', $customer->id)
            ->assertJsonPath('data.0.added_by.id', $agent->id)
            ->assertJsonPath('data.0.added_by.full_name', 'Aminata Fall')
            ->assertJsonPath('data.0.tasks_count', 1);
    }

    public function test_update_to_converted_with_reason_creates_customer_note(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create([
            'added_by_id' => $user->id,
            'pipeline_stage' => CustomerPipelineStage::Negotiating,
        ]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}", [
            'pipeline_stage' => 'converted',
            'reason' => 'Signature du bail aujourd\'hui.',
        ])->assertOk()
            ->assertJsonPath('data.pipeline_stage', 'converted');

        $this->assertDatabaseHas('customer_notes', [
            'customer_id' => $customer->id,
            'pinned' => true,
        ]);
    }

    public function test_update_to_lost_via_pipeline_stage_endpoint_creates_note(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create([
            'added_by_id' => $user->id,
            'pipeline_stage' => CustomerPipelineStage::Negotiating,
        ]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}/pipeline-stage", [
            'pipeline_stage' => 'lost',
            'reason' => 'Le prospect a choisi un autre agent.',
        ])->assertOk();

        $this->assertDatabaseHas('customer_notes', [
            'customer_id' => $customer->id,
            'pinned' => true,
        ]);

        $note = CustomerNote::where('customer_id', $customer->id)->first();
        $this->assertStringContainsString('autre agent', $note->body);
    }

    public function test_update_to_lead_does_not_create_note(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create([
            'added_by_id' => $user->id,
            'pipeline_stage' => CustomerPipelineStage::Prospect,
        ]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}", [
            'pipeline_stage' => 'lead',
            'reason' => 'should be ignored',
        ])->assertOk();

        $this->assertDatabaseMissing('customer_notes', ['customer_id' => $customer->id]);
    }

    public function test_pipeline_stage_change_logs_activity(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create([
            'added_by_id' => $user->id,
            'pipeline_stage' => CustomerPipelineStage::Lead,
        ]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}/pipeline-stage", [
            'pipeline_stage' => 'prospect',
        ])->assertOk();

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => Customer::class,
            'subject_id' => $customer->id,
        ]);
    }
}
