<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerCrmTest extends TestCase
{
    use RefreshDatabase;

    public function test_set_primary_contact(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $agent = User::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/primary-contact", [
            'user_id' => $agent->id,
        ])->assertOk()
            ->assertJsonPath('data.is_primary', true);

        $this->assertDatabaseHas('user_customer_relationships', [
            'customer_id' => $customer->id,
            'user_id' => $agent->id,
            'is_primary' => true,
        ]);
    }

    public function test_set_primary_contact_resets_previous(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $agent1 = User::factory()->create();
        $agent2 = User::factory()->create();

        // First set agent1 as primary
        UserCustomerRelationship::create([
            'customer_id' => $customer->id,
            'user_id' => $agent1->id,
            'relationship_type' => 'agent_client',
            'is_primary' => true,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/customers/{$customer->id}/primary-contact", [
            'user_id' => $agent2->id,
        ])->assertOk();

        // Agent1 should no longer be primary
        $this->assertDatabaseHas('user_customer_relationships', [
            'customer_id' => $customer->id,
            'user_id' => $agent1->id,
            'is_primary' => false,
        ]);
        $this->assertDatabaseHas('user_customer_relationships', [
            'customer_id' => $customer->id,
            'user_id' => $agent2->id,
            'is_primary' => true,
        ]);
    }

    public function test_update_pipeline_stage(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}/pipeline-stage", [
            'pipeline_stage' => 'converted',
        ])->assertOk()
            ->assertJsonPath('data.pipeline_stage', 'converted');
    }

    public function test_invalid_pipeline_stage_returns_422(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}/pipeline-stage", [
            'pipeline_stage' => 'invalid_stage',
        ])->assertStatus(422);
    }

    public function test_unrelated_user_cannot_update_pipeline(): void
    {
        $customer = Customer::factory()->create();

        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/customers/{$customer->id}/pipeline-stage", [
            'pipeline_stage' => 'converted',
        ])->assertForbidden();
    }
}
