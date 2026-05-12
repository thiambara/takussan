<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Role access matrix for protected admin endpoints (TCK-014 AC).
 *
 * Walks each protected endpoint with admin / agent / customer and confirms
 * the expected access pattern (grant vs 403).
 */
class RoleAccessTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_admin_can_access_users_list(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/users')->assertOk();
    }

    public function test_agent_cannot_access_users_list(): void
    {
        $this->apiActingAsRole('agent');

        $this->apiGet('/api/users')->assertForbidden();
    }

    public function test_customer_cannot_access_users_list(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet('/api/users')->assertForbidden();
    }

    public function test_admin_can_block_user(): void
    {
        $this->apiActingAsRole('super_admin');
        $target = User::factory()->create();

        $this->apiPost("/api/users/{$target->id}/block")->assertOk();
    }

    public function test_agent_cannot_block_user(): void
    {
        $this->apiActingAsRole('agent');
        $target = User::factory()->create();

        $this->apiPost("/api/users/{$target->id}/block")->assertForbidden();
    }

    public function test_customer_cannot_block_user(): void
    {
        $this->apiActingAsRole('customer');
        $target = User::factory()->create();

        $this->apiPost("/api/users/{$target->id}/block")->assertForbidden();
    }

    public function test_admin_can_activate_user(): void
    {
        $this->apiActingAsRole('super_admin');
        $target = User::factory()->create();

        $this->apiPost("/api/users/{$target->id}/activate")->assertOk();
    }

    public function test_agent_cannot_activate_user(): void
    {
        $this->apiActingAsRole('agent');
        $target = User::factory()->create();

        $this->apiPost("/api/users/{$target->id}/activate")->assertForbidden();
    }

    public function test_admin_can_delete_user(): void
    {
        $this->apiActingAsRole('super_admin');
        $target = User::factory()->create();

        $this->apiDelete("/api/users/{$target->id}")->assertNoContent();
    }

    public function test_customer_cannot_delete_user(): void
    {
        $this->apiActingAsRole('customer');
        $target = User::factory()->create();

        $this->apiDelete("/api/users/{$target->id}")->assertForbidden();
    }

    public function test_super_admin_can_set_user_role(): void
    {
        $this->apiActingAsRole('super_admin');
        $target = User::factory()->create([
            'agency_id' => Agency::factory()->create()->id,
        ]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();
    }

    public function test_agent_cannot_set_user_role(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'customer'])
            ->assertForbidden();
    }

    public function test_customer_cannot_set_user_role(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('customer', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertForbidden();
    }
}
