<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

class UserAdminTest extends TestCase
{
    // TCK-281 — `User` est desormais `Searchable` : cf. AgencyTest.
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    protected function createAdmin(): User
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'super_admin');

        return $admin;
    }

    public function test_admin_can_list_users(): void
    {
        $admin = $this->createAdmin();
        User::factory()->count(5)->create();

        Sanctum::actingAs($admin);

        $this->getJson('/api/users')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['total']]);
    }

    public function test_admin_can_search_users_by_name(): void
    {
        $admin = $this->createAdmin();
        User::factory()->create(['first_name' => 'Amadou', 'last_name' => 'Diop']);
        User::factory()->create(['first_name' => 'Fatou', 'last_name' => 'Sall']);
        $this->indexSearchable(User::class);

        Sanctum::actingAs($admin);

        $this->getJson('/api/users?filter[search]=Amadou')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_non_admin_cannot_list_users(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/users')->assertForbidden();
    }

    public function test_admin_can_block_user(): void
    {
        $admin = $this->createAdmin();
        $user = User::factory()->create();

        Sanctum::actingAs($admin);

        $this->postJson("/api/users/{$user->id}/block")
            ->assertOk()
            ->assertJsonPath('data.status', UserStatus::Blocked->value);

        $this->assertDatabaseHas('users', ['id' => $user->id, 'status' => UserStatus::Blocked->value]);
    }

    public function test_admin_cannot_block_self(): void
    {
        $admin = $this->createAdmin();

        Sanctum::actingAs($admin);

        $this->postJson("/api/users/{$admin->id}/block")
            ->assertStatus(422);
    }

    public function test_admin_can_activate_user(): void
    {
        $admin = $this->createAdmin();
        $user = User::factory()->create(['status' => UserStatus::Blocked->value]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/users/{$user->id}/activate")
            ->assertOk()
            ->assertJsonPath('data.status', UserStatus::Active->value);
    }

    // TCK-278 — Les endpoints POST /users/{user}/roles et
    // DELETE /users/{user}/roles/{role} ont été retirés en P3 (cf.
    // routes/api/users.php). L'assignation de rôle passe désormais par
    // `PUT /users/{user}/role` (UserRoleController), testé dans
    // UserRoleControllerTest.

    public function test_admin_can_delete_user(): void
    {
        $admin = $this->createAdmin();
        $user = User::factory()->create();

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/users/{$user->id}")
            ->assertNoContent();

        $this->assertSoftDeleted('users', ['id' => $user->id]);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'first_name' => 'Deleted']);
    }

    public function test_user_can_delete_own_account(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->deleteJson('/api/auth/account')
            ->assertNoContent();

        $this->assertSoftDeleted('users', ['id' => $user->id]);
    }

    public function test_unpublish_available_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/unpublish")
            ->assertOk()
            ->assertJsonPath('data.status', PropertyStatus::Draft->value);
    }

    public function test_cannot_unpublish_non_available_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create([
            'user_id' => $user->id,
            'status' => PropertyStatus::Sold->value,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/unpublish")
            ->assertStatus(422);
    }

    public function test_record_view_on_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id, 'views_count' => 0]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/view")
            ->assertOk()
            ->assertJsonPath('data.views_count', 1);
    }

    public function test_property_children_hierarchy(): void
    {
        $user = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $user->id]);
        Property::factory()->count(2)->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

        Sanctum::actingAs($user);

        $this->getJson("/api/properties/{$parent->id}/children")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
