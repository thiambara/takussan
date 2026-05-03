<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AgencyAgentTest extends TestCase
{
    use RefreshDatabase;

    protected function createAdminWithAgency(): array
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::findOrCreate('admin');
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $admin->assignRole('admin');
        $agency->update(['primary_admin_id' => $admin->id]);

        return [$admin, $agency];
    }

    public function test_admin_can_add_agent_to_agency(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $agent = User::factory()->create();

        Sanctum::actingAs($admin);

        $this->postJson("/api/agencies/{$agency->id}/agents", [
            'user_id' => $agent->id,
        ])->assertOk();

        $this->assertDatabaseHas('agent_profiles', ['user_id' => $agent->id, 'agency_id' => $agency->id]);
    }

    public function test_cannot_add_user_already_in_another_agency(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $otherAgency = Agency::factory()->create();
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $otherAgency->id]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/agencies/{$agency->id}/agents", [
            'user_id' => $agent->id,
        ])->assertStatus(422);
    }

    public function test_admin_can_remove_agent_from_agency(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agencies/{$agency->id}/agents/{$agent->id}")
            ->assertOk();

        $this->assertSame(0, AgentProfile::query()->where('user_id', $agent->id)->where('agency_id', $agency->id)->count());
    }

    public function test_cannot_remove_primary_admin(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agencies/{$agency->id}/agents/{$admin->id}")
            ->assertStatus(422);
    }

    public function test_non_admin_cannot_add_agent(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $regularUser = User::factory()->create();
        $newAgent = User::factory()->create();

        Sanctum::actingAs($regularUser);

        $this->postJson("/api/agencies/{$agency->id}/agents", [
            'user_id' => $newAgent->id,
        ])->assertForbidden();
    }
}
