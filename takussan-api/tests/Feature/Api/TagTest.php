<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TagTest extends TestCase
{
    use RefreshDatabase;

    private function superAdmin(): User
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        Role::findOrCreate('super_admin');
        $user = User::factory()->create();
        $user->assignRole('super_admin');

        return $user;
    }

    private function agencyAdmin(): User
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::findOrCreate('agency_admin');
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $user->assignRole('agency_admin');

        return $user;
    }

    /**
     * TCK-213 — tags are global platform references. Agency admins may read
     * them for property forms, but cannot mutate the shared reference data.
     */
    public function test_agency_admin_cannot_create_tag(): void
    {
        Sanctum::actingAs($this->agencyAdmin());

        $this->postJson('/api/tags', [
            'name' => 'Balcon',
            'type' => TagType::Amenity->value,
        ])->assertForbidden();
    }

    public function test_anyone_can_list_tags(): void
    {
        Tag::factory()->count(3)->create(['type' => TagType::Amenity]);

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/tags')->assertOk();
        $this->assertGreaterThanOrEqual(3, $response->json('meta.total'));
    }

    public function test_anyone_can_show_tag(): void
    {
        $tag = Tag::factory()->create(['type' => TagType::Feature]);

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson("/api/tags/{$tag->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $tag->id);
    }

    public function test_super_admin_can_create_tag(): void
    {
        $admin = $this->superAdmin();
        Sanctum::actingAs($admin);

        $this->postJson('/api/tags', [
            'name' => 'Pool',
            'type' => TagType::Amenity->value,
        ])->assertStatus(201)
            ->assertJsonPath('data.name', 'Pool')
            ->assertJsonPath('data.type', TagType::Amenity->value);
    }

    public function test_regular_user_cannot_create_tag(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/tags', [
            'name' => 'Pool',
            'type' => TagType::Amenity->value,
        ])->assertForbidden();
    }

    public function test_invalid_type_returns_422(): void
    {
        $admin = $this->superAdmin();
        Sanctum::actingAs($admin);

        $this->postJson('/api/tags', [
            'name' => 'Pool',
            'type' => 'invalid_type',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['type']);
    }

    public function test_super_admin_can_update_tag(): void
    {
        $admin = $this->superAdmin();
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);

        Sanctum::actingAs($admin);

        $this->putJson("/api/tags/{$tag->id}", ['name' => 'Swimming Pool'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Swimming Pool');
    }

    public function test_regular_user_cannot_update_tag(): void
    {
        $user = User::factory()->create();
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);

        Sanctum::actingAs($user);

        $this->putJson("/api/tags/{$tag->id}", ['name' => 'Hacked'])
            ->assertForbidden();
    }

    public function test_super_admin_can_delete_tag(): void
    {
        $admin = $this->superAdmin();
        $tag = Tag::factory()->create(['type' => TagType::Feature]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/tags/{$tag->id}")->assertNoContent();
        $this->assertDatabaseMissing('tags', ['id' => $tag->id]);
    }

    public function test_regular_user_cannot_delete_tag(): void
    {
        $user = User::factory()->create();
        $tag = Tag::factory()->create(['type' => TagType::Feature]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/tags/{$tag->id}")->assertForbidden();
    }

    public function test_delete_tag_in_use_returns_409(): void
    {
        $admin = $this->superAdmin();
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);
        $property = Property::factory()->create();
        $tag->properties()->attach($property->id);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/tags/{$tag->id}")
            ->assertStatus(409)
            ->assertJsonPath('usage', 1);

        $this->assertDatabaseHas('tags', ['id' => $tag->id]);
    }
}
