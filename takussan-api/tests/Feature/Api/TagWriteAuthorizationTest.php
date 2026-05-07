<?php

namespace Tests\Feature\Api;

use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

class TagWriteAuthorizationTest extends BaseTestCase
{
    use RefreshDatabase;

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

    public function test_tag_reads_still_work_for_authenticated_roles(): void
    {
        Tag::factory()->create(['type' => TagType::Feature]);

        $this->actingAsRole('agency_admin');

        $this->getJson('/api/tags?fields[tags]=id,name,slug,type')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
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
