<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerCrmTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-591 — le référent est du personnel de l'agence du client, et le désigner exige
     * `crm.assign` : le jeu pose donc une agence et deux agents (il désignait un compte quelconque).
     *
     * @return array{0: User, 1: Agency}
     */
    private function agentInAgency(?Agency $agency = null): array
    {
        $agency ??= Agency::factory()->create();
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $agency);

        return [$user, $agency];
    }

    public function test_set_primary_contact(): void
    {
        [$user, $agency] = $this->agentInAgency();
        $customer = Customer::factory()->create(['added_by_id' => $user->id, 'agency_id' => $agency->id]);
        [$agent] = $this->agentInAgency($agency);

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
        [$user, $agency] = $this->agentInAgency();
        $customer = Customer::factory()->create(['added_by_id' => $user->id, 'agency_id' => $agency->id]);
        [$agent1] = $this->agentInAgency($agency);
        [$agent2] = $this->agentInAgency($agency);

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
