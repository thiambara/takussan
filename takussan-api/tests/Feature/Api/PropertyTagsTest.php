<?php

namespace Tests\Feature\Api;

use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyTagsTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_sync_amenity_tags(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tagA = Tag::factory()->create(['type' => TagType::Amenity]);
        $tagB = Tag::factory()->create(['type' => TagType::Amenity]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/tags", [
            'tag_ids' => [$tagA->id, $tagB->id],
        ])->assertOk()
            ->assertJsonCount(2, 'data');

        $this->assertCount(2, $property->refresh()->tags);
    }

    public function test_sync_replaces_existing_tags(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $existing = Tag::factory()->create(['type' => TagType::Amenity]);
        $property->tags()->attach($existing);

        $newTag = Tag::factory()->create(['type' => TagType::Amenity]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/tags", [
            'tag_ids' => [$newTag->id],
        ])->assertOk();

        $ids = $property->refresh()->tags->pluck('id')->all();
        $this->assertSame([$newTag->id], $ids);
    }

    public function test_sync_rejects_non_amenity_tag(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $featureTag = Tag::factory()->create(['type' => TagType::Feature]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/tags", [
            'tag_ids' => [$featureTag->id],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['tag_ids.0']);

        $this->assertCount(0, $property->refresh()->tags);
    }

    public function test_owner_can_detach_single_tag(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tagA = Tag::factory()->create(['type' => TagType::Amenity]);
        $tagB = Tag::factory()->create(['type' => TagType::Amenity]);
        $property->tags()->attach([$tagA->id, $tagB->id]);

        Sanctum::actingAs($owner);

        $this->deleteJson("/api/properties/{$property->id}/tags/{$tagA->id}")
            ->assertNoContent();

        $ids = $property->refresh()->tags->pluck('id')->all();
        $this->assertSame([$tagB->id], $ids);
    }

    /**
     * TCK-488 — la synchronisation porte sur les ÉQUIPEMENTS, pas sur tous les tags du bien.
     *
     * `sync()` remplaçait la totalité de la table de liaison, alors que `SyncPropertyTagRequest`
     * n'accepte que des ids de type `amenity` : un tag `feature` — ce que `FilterCoverageSeeder`
     * attache couramment — ne pouvait ni être renvoyé (422) ni survivre (détaché). L'écran
     * d'édition n'en affiche aucun : il ne peut pas en répondre.
     */
    public function test_sync_preserves_tags_the_screen_never_shows(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $feature = Tag::factory()->create(['type' => TagType::Feature]);
        $ancienneAmenite = Tag::factory()->create(['type' => TagType::Amenity]);
        $property->tags()->attach([$feature->id, $ancienneAmenite->id]);

        $nouvelleAmenite = Tag::factory()->create(['type' => TagType::Amenity]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/tags", [
            'tag_ids' => [$nouvelleAmenite->id],
        ])->assertOk();

        $ids = $property->refresh()->tags->pluck('id')->sort()->values()->all();
        $attendus = collect([$feature->id, $nouvelleAmenite->id])->sort()->values()->all();
        $this->assertSame($attendus, $ids);
    }

    public function test_sync_with_empty_array_keeps_non_amenity_tags(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $feature = Tag::factory()->create(['type' => TagType::Feature]);
        $amenite = Tag::factory()->create(['type' => TagType::Amenity]);
        $property->tags()->attach([$feature->id, $amenite->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/tags", ['tag_ids' => []])->assertOk();

        $this->assertSame([$feature->id], $property->refresh()->tags->pluck('id')->all());
    }

    public function test_random_user_cannot_sync_tags(): void
    {
        $property = Property::factory()->create();
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);

        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/properties/{$property->id}/tags", [
            'tag_ids' => [$tag->id],
        ])->assertForbidden();
    }

    public function test_sync_with_empty_array_clears_tags(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);
        $property->tags()->attach($tag);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/tags", [
            'tag_ids' => [],
        ])->assertOk()
            ->assertJsonCount(0, 'data');

        $this->assertCount(0, $property->refresh()->tags);
    }
}
