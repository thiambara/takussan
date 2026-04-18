<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerTest extends TestCase
{
    use RefreshDatabase;

    public function test_agent_creates_customer_and_lists_own_customers(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/customers', [
            'first_name' => 'Amadou',
            'last_name' => 'Diop',
            'email' => 'amadou@example.com',
            'phone' => '+221771234567',
            'pipeline_stage' => 'prospect',
        ])->assertCreated()
            ->assertJsonPath('data.pipeline_stage', 'prospect');

        $this->getJson('/api/customers')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_can_update_customer_pipeline_stage(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/customers/{$customer->id}", ['pipeline_stage' => 'converted'])
            ->assertOk()
            ->assertJsonPath('data.pipeline_stage', 'converted');
    }

    public function test_user_can_show_own_customer(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->getJson("/api/customers/{$customer->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $customer->id);
    }

    public function test_unrelated_user_cannot_show_customer(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $owner->id]);

        Sanctum::actingAs($other);

        $this->getJson("/api/customers/{$customer->id}")->assertForbidden();
    }

    public function test_user_can_update_customer_fields(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->putJson("/api/customers/{$customer->id}", [
            'first_name' => 'Updated',
            'last_name' => 'Name',
        ])->assertOk()
            ->assertJsonPath('data.first_name', 'Updated');
    }

    public function test_user_can_delete_own_customer(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/customers/{$customer->id}")
            ->assertStatus(204);

        $this->assertSoftDeleted('customers', ['id' => $customer->id]);
    }

    public function test_unrelated_user_cannot_delete_customer(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $owner->id]);

        Sanctum::actingAs($other);

        $this->deleteJson("/api/customers/{$customer->id}")->assertForbidden();
    }
}
