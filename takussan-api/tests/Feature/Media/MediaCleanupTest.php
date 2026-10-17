<?php

namespace Tests\Feature\Media;

use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

class MediaCleanupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // TCK-538 : les deux disques de médias — le privé est le défaut (ADR-0029 §3).
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
    }

    public function test_command_deletes_media_whose_model_type_is_unknown(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertCreated();

        // Force an orphan: point media to a bogus class and backdate it.
        Media::query()->update([
            'model_type' => 'App\\Models\\ThisDoesNotExist',
            'created_at' => now()->subDays(2),
        ]);

        $this->artisan('media:cleanup')->assertSuccessful();

        $this->assertDatabaseCount('media', 0);
    }

    public function test_command_keeps_fresh_orphans_within_24h(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertCreated();

        // Orphan but recent → should be kept.
        Media::query()->update([
            'model_type' => 'App\\Models\\ThisDoesNotExist',
            'created_at' => now()->subMinutes(30),
        ]);

        $this->artisan('media:cleanup')->assertSuccessful();

        $this->assertDatabaseCount('media', 1);
    }

    public function test_command_keeps_media_with_existing_target(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertCreated();

        Media::query()->update(['created_at' => now()->subDays(3)]);

        $this->artisan('media:cleanup')->assertSuccessful();

        $this->assertDatabaseCount('media', 1);
    }

    /**
     * TCK-750 (P10.04) — les médias d'un modèle supprimé en douceur restent 90 jours après
     * `deleted_at`. Avant, la portée de `SoftDeletes` les faisait juger orphelins, et les photos
     * d'un bien supprimé la veille étaient détruites à 03:00.
     */
    public function test_media_of_a_recently_soft_deleted_model_are_kept(): void
    {
        $property = Property::factory()->create();
        $property->addMedia(UploadedFile::fake()->image('salon.jpg'))->toMediaCollection('photos');
        Media::query()->update(['created_at' => now()->subDays(2)]);

        $property->delete();
        $this->travel(89)->days();

        $this->artisan('media:cleanup')->assertSuccessful();

        $this->assertDatabaseCount('media', 1);
    }

    public function test_media_of_a_model_soft_deleted_over_90_days_ago_are_purged(): void
    {
        $property = Property::factory()->create();
        $property->addMedia(UploadedFile::fake()->image('salon.jpg'))->toMediaCollection('photos');

        $property->delete();
        $this->travel(91)->days();

        $this->artisan('media:cleanup')->assertSuccessful();

        $this->assertDatabaseCount('media', 0);
    }

    public function test_evidence_collections_are_never_purged_with_their_soft_deleted_model(): void
    {
        $lease = Lease::factory()->create();
        $lease->addMedia(UploadedFile::fake()->create('contrat.pdf', 10, 'application/pdf'))->toMediaCollection('signed_contract');
        $lease->addMedia(UploadedFile::fake()->image('virement.jpg'))->toMediaCollection('lease_deposit_refund');

        $inventory = Inventory::factory()->create(['status' => InventoryStatus::Signed]);
        $inventory->addMedia(UploadedFile::fake()->image('cuisine.jpg'))->toMediaCollection('room_photos');

        $lease->delete();
        $inventory->delete();
        $this->travel(400)->days();

        $this->artisan('media:cleanup')->assertSuccessful();

        $this->assertEqualsCanonicalizing(
            ['signed_contract', 'room_photos'],
            Media::query()->pluck('collection_name')->all(),
        );
    }

    public function test_media_of_a_hard_deleted_model_are_still_purged(): void
    {
        $property = Property::factory()->create();
        $property->addMedia(UploadedFile::fake()->image('salon.jpg'))->toMediaCollection('photos');
        Media::query()->update(['created_at' => now()->subDays(2)]);
        Property::withTrashed()->whereKey($property->id)->toBase()->delete();

        $this->artisan('media:cleanup')->assertSuccessful();

        $this->assertDatabaseCount('media', 0);
    }
}
