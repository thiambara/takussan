<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class TagTest extends TestCase
{
    use RefreshDatabase;

    private function superAdmin(): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'super_admin');

        return $user;
    }

    private function agencyAdmin(): User
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($user, 'agency_admin', $agency);

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

    // TCK-3017 — ex-TagWriteAuthorizationTest (TCK-2025) : le journal des écritures, le refus du personnel
    // d'agence sur les trois verbes, et les biens étiquetés préservés à l'écriture.

    public function test_super_admin_can_write_tags_and_activity_is_logged(): void
    {
        $this->actingAsRole('super_admin');

        $createdId = $this->postJson('/api/tags', [
            'name' => 'Terrasse privée',
            'type' => TagType::Amenity->value,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Terrasse privée')
            ->json('data.id');

        $this->patchJson("/api/tags/{$createdId}", ['name' => 'Terrasse'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Terrasse');

        $this->deleteJson("/api/tags/{$createdId}")
            ->assertNoContent();

        $this->assertTrue(Activity::query()->where('event', 'super_admin_tag_created')->exists());
        $this->assertTrue(Activity::query()->where('event', 'super_admin_tag_updated')->exists());
        $this->assertTrue(Activity::query()->where('event', 'super_admin_tag_disabled')->exists());
    }

    public function test_agency_admin_and_agent_cannot_write_tags(): void
    {
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);

        $this->actingAsRole('agency_admin');
        $this->postJson('/api/tags', [
            'name' => 'Piscine',
            'type' => TagType::Amenity->value,
        ])->assertForbidden();
        $this->patchJson("/api/tags/{$tag->id}", ['name' => 'Piscine privée'])->assertForbidden();
        $this->deleteJson("/api/tags/{$tag->id}")->assertForbidden();

        $this->actingAsRole('agent');
        $this->postJson('/api/tags', [
            'name' => 'Balcon',
            'type' => TagType::Amenity->value,
        ])->assertForbidden();
        $this->patchJson("/api/tags/{$tag->id}", ['name' => 'Balcon filant'])->assertForbidden();
        $this->deleteJson("/api/tags/{$tag->id}")->assertForbidden();
    }

    public function test_tag_write_does_not_drop_property_relationships(): void
    {
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);
        $property = Property::factory()->create();
        $tag->properties()->attach($property->id);

        $this->actingAsRole('super_admin');

        $this->patchJson("/api/tags/{$tag->id}", ['name' => 'Piscine commune'])
            ->assertOk();

        $this->assertDatabaseHas('taggables', [
            'tag_id' => $tag->id,
            'taggable_id' => $property->id,
            'taggable_type' => Property::class,
        ]);
    }
}
