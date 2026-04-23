<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AgencyMembersListTest extends TestCase
{
    use RefreshDatabase;

    protected function createAdminWithAgency(): array
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::findOrCreate('admin');
        Role::findOrCreate('agency_admin');
        Role::findOrCreate('agent');
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $admin->assignRole('admin');
        $agency->update(['primary_admin_id' => $admin->id]);

        return [$admin, $agency];
    }

    public function test_admin_can_list_agency_members(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        User::factory()->count(3)->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/agencies/{$agency->id}/members")
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['total', 'current_page']])
            ->assertJsonPath('meta.total', 4); // 3 members + admin
    }

    public function test_non_admin_cannot_list_members(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $outsider = User::factory()->create();

        Sanctum::actingAs($outsider);

        $this->getJson("/api/agencies/{$agency->id}/members")
            ->assertForbidden();
    }

    public function test_admin_can_add_member_by_email(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $target = User::factory()->create(['email' => 'target@example.com', 'agency_id' => null]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/agencies/{$agency->id}/members", [
            'email' => 'target@example.com',
            'role' => 'agent',
        ])->assertOk()
            ->assertJsonPath('data.user_id', $target->id)
            ->assertJsonPath('data.role', 'agent');

        $this->assertDatabaseHas('users', ['id' => $target->id, 'agency_id' => $agency->id]);
    }

    public function test_adding_member_with_unknown_email_returns_422(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        Sanctum::actingAs($admin);

        $this->postJson("/api/agencies/{$agency->id}/members", [
            'email' => 'unknown@example.com',
            'role' => 'agent',
        ])->assertStatus(422);
    }

    public function test_admin_can_add_member_as_agency_admin(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $target = User::factory()->create(['agency_id' => null]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/agencies/{$agency->id}/members", [
            'user_id' => $target->id,
            'role' => 'agency_admin',
        ])->assertOk()
            ->assertJsonPath('data.role', 'agency_admin');

        $this->assertTrue($target->refresh()->hasRole('agency_admin'));
    }

    public function test_cannot_add_member_with_invalid_role(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $target = User::factory()->create(['agency_id' => null]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/agencies/{$agency->id}/members", [
            'user_id' => $target->id,
            'role' => 'super_admin',
        ])->assertStatus(422);
    }

    public function test_cannot_remove_last_agency_admin(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        // Create a second member who is the only agency_admin. The primary_admin
        // guard already blocks removing `admin`, so we use a separate user.
        $onlyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $onlyAdmin->assignRole('agency_admin');

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agencies/{$agency->id}/members/{$onlyAdmin->id}")
            ->assertStatus(422);
    }
}
