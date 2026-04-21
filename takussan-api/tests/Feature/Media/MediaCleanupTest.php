<?php

namespace Tests\Feature\Media;

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
        Storage::fake('public');
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
}
