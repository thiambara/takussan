<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_and_lists_agencies(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/agencies', [
            'name' => 'Takussan Immo',
            'email' => 'contact@takussan.sn',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Takussan Immo');

        $this->getJson('/api/agencies')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_user_cannot_create_second_agency(): void
    {
        $user = User::factory()->create();
        Agency::factory()->create(['primary_admin_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson('/api/agencies', ['name' => 'Second'])
            ->assertStatus(422);
    }

    public function test_only_primary_admin_can_update_agency(): void
    {
        $admin = User::factory()->create();
        $other = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($other);
        $this->patchJson("/api/agencies/{$agency->id}", ['name' => 'hijack'])
            ->assertForbidden();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}", ['name' => 'New Name'])
            ->assertOk()
            ->assertJsonPath('data.name', 'New Name');
    }

    public function test_anyone_authenticated_can_show_agency(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        $other = User::factory()->create();

        Sanctum::actingAs($other);

        $this->getJson("/api/agencies/{$agency->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $agency->id);
    }

    public function test_primary_admin_can_delete_agency(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agencies/{$agency->id}")->assertNoContent();
        $this->assertSoftDeleted('agencies', ['id' => $agency->id]);
    }

    public function test_non_primary_admin_cannot_delete_agency(): void
    {
        $admin = User::factory()->create();
        $other = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($other);

        $this->deleteJson("/api/agencies/{$agency->id}")->assertForbidden();
    }
}
