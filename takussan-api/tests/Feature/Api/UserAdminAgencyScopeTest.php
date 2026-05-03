<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-147 — `/api/users` opened to `agency_admin` (auto-scoped to their
 * active profile's agency) and `block`/`activate` available to
 * `agency_admin` for users in their agency.
 */
class UserAdminAgencyScopeTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_agency_admin_lists_only_users_with_a_profile_in_active_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);

        // Same-agency users — must appear.
        $sameAgent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $sameAgent->id, 'agency_id' => $agencyA->id]);
        $sameOwner = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $sameOwner->id, 'agency_id' => $agencyA->id]);

        // Cross-agency user — must NOT appear.
        $other = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $other->id, 'agency_id' => $agencyB->id]);

        // No profile at all — must NOT appear.
        $orphan = User::factory()->create(['agency_id' => null]);

        $ids = collect($this->apiGet('/api/users')->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($admin->id));
        $this->assertTrue($ids->contains($sameAgent->id));
        $this->assertTrue($ids->contains($sameOwner->id));
        $this->assertFalse($ids->contains($other->id));
        $this->assertFalse($ids->contains($orphan->id));
    }

    public function test_agency_admin_can_filter_by_role(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $agentUser = User::factory()->create(['agency_id' => $agency->id]);
        $agentUser->assignRole('agent');

        $customerUser = User::factory()->create(['agency_id' => $agency->id]);
        $customerUser->assignRole('customer');

        $ids = collect($this->apiGet('/api/users?filter[role]=agent')->assertOk()->json('data'))
            ->pluck('id');

        $this->assertTrue($ids->contains($agentUser->id));
        $this->assertFalse($ids->contains($customerUser->id));
    }

    public function test_super_admin_keeps_cross_tenant_listing(): void
    {
        $this->apiActingAsRole('super_admin');

        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $userA = User::factory()->create(['agency_id' => $agencyA->id]);
        $userB = User::factory()->create(['agency_id' => $agencyB->id]);

        $ids = collect($this->apiGet('/api/users')->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($userA->id));
        $this->assertTrue($ids->contains($userB->id));
    }

    public function test_agency_admin_can_block_user_in_active_agency(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $target = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $target->id, 'agency_id' => $agency->id]);

        $this->apiPost("/api/users/{$target->id}/block")
            ->assertOk()
            ->assertJsonPath('data.status', UserStatus::Blocked->value);

        $this->assertSame(UserStatus::Blocked, $target->fresh()->status);
    }

    public function test_agency_admin_cannot_block_user_in_other_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);

        $target = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $target->id, 'agency_id' => $agencyB->id]);

        $this->apiPost("/api/users/{$target->id}/block")
            ->assertStatus(422)
            ->assertJsonPath('message', __('messages.target_user_not_in_active_agency'));
    }

    public function test_agency_admin_cannot_block_self(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiPost("/api/users/{$admin->id}/block")
            ->assertStatus(422)
            ->assertJsonPath('message', __('messages.cannot_block_self'));
    }

    public function test_agency_admin_can_activate_user_in_active_agency(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $target = User::factory()->create(['status' => UserStatus::Blocked->value]);
        AgentProfile::factory()->create(['user_id' => $target->id, 'agency_id' => $agency->id]);

        $this->apiPost("/api/users/{$target->id}/activate")
            ->assertOk()
            ->assertJsonPath('data.status', UserStatus::Active->value);
    }

    public function test_super_admin_can_block_any_user(): void
    {
        $this->apiActingAsRole('super_admin');

        $target = User::factory()->create();

        $this->apiPost("/api/users/{$target->id}/block")
            ->assertOk();
    }

    public function test_role_endpoint_returns_403_with_target_message_when_target_outside_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);

        $target = User::factory()->create(['agency_id' => $agencyB->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertForbidden()
            ->assertJsonPath('message', __('messages.target_user_not_in_active_agency'));
    }

    public function test_outsider_without_admin_role_cannot_list(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet('/api/users')->assertForbidden();
    }
}
