<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyPriceHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-074 — `POST /api/properties/{property}/duplicate`.
 */
class PropertyDuplicationTest extends TestCase
{
    use RefreshDatabase;

    public function test_requires_auth(): void
    {
        $property = Property::factory()->create();
        $this->postJson("/api/properties/{$property->id}/duplicate")
            ->assertUnauthorized();
    }

    public function test_duplicate_creates_draft_with_new_reference(): void
    {
        $owner = User::factory()->create();
        $source = Property::factory()->create([
            'user_id' => $owner->id,
            'title' => 'Villa Almadies',
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
            'views_count' => 42,
        ]);

        Sanctum::actingAs($owner);

        $response = $this->postJson("/api/properties/{$source->id}/duplicate", []);
        $response->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.visibility', 'private');

        $newId = $response->json('data.id');
        $this->assertNotSame($source->id, $newId);

        $clone = Property::findOrFail($newId);
        $this->assertSame(PropertyStatus::Draft, $clone->status);
        $this->assertSame(PropertyVisibility::Private, $clone->visibility);
        $this->assertNull($clone->published_at);
        $this->assertSame(0, (int) $clone->views_count);
        $this->assertNotSame($source->reference_number, $clone->reference_number);
        $this->assertNotSame($source->slug, $clone->slug);
        $this->assertSame('Villa Almadies (copie)', $clone->title);
    }

    public function test_duplicate_copies_media_when_requested(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $source = Property::factory()->create(['user_id' => $owner->id]);
        $source->addMedia(UploadedFile::fake()->image('front.jpg'))
            ->toMediaCollection('photos');

        Sanctum::actingAs($owner);

        $response = $this->postJson("/api/properties/{$source->id}/duplicate", [
            'copy_media' => true,
        ])->assertCreated();

        $clone = Property::findOrFail($response->json('data.id'));
        $this->assertCount(1, $clone->getMedia('photos'));

        $sourceMedia = $source->getMedia('photos')->first();
        $cloneMedia = $clone->getMedia('photos')->first();
        $this->assertNotSame($sourceMedia->id, $cloneMedia->id);
    }

    public function test_duplicate_without_copy_media_has_no_photos(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $source = Property::factory()->create(['user_id' => $owner->id]);
        $source->addMedia(UploadedFile::fake()->image('front.jpg'))
            ->toMediaCollection('photos');

        Sanctum::actingAs($owner);

        $response = $this->postJson("/api/properties/{$source->id}/duplicate", [])
            ->assertCreated();

        $clone = Property::findOrFail($response->json('data.id'));
        $this->assertCount(0, $clone->getMedia('photos'));
    }

    public function test_duplicate_does_not_copy_bookings_or_price_history(): void
    {
        $owner = User::factory()->create();
        $source = Property::factory()->create(['user_id' => $owner->id, 'price' => 100000]);
        Booking::factory()->create(['property_id' => $source->id]);
        PropertyPriceHistory::create([
            'property_id' => $source->id,
            'old_price' => 90000,
            'new_price' => 100000,
            'currency' => 'XOF',
            'changed_at' => now(),
            'changed_by_id' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $response = $this->postJson("/api/properties/{$source->id}/duplicate", [])
            ->assertCreated();

        $clone = Property::findOrFail($response->json('data.id'));
        $this->assertSame(0, $clone->bookings()->count());
        $this->assertSame(0, $clone->priceHistory()->count());
    }

    public function test_unauthorized_user_gets_403(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $source = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($stranger);

        $this->postJson("/api/properties/{$source->id}/duplicate", [])
            ->assertForbidden();
    }

    public function test_duplicate_logs_activity(): void
    {
        $owner = User::factory()->create();
        $source = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$source->id}/duplicate", [])
            ->assertCreated();

        $this->assertTrue(
            Activity::query()
                ->where('description', 'property.duplicated')
                ->where('causer_id', $owner->id)
                ->exists()
        );
    }
}
