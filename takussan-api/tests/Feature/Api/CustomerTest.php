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
}
