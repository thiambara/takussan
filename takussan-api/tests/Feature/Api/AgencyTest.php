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
}
