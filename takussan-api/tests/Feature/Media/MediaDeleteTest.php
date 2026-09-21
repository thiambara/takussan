<?php

namespace Tests\Feature\Media;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

class MediaDeleteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // TCK-538 : les deux disques de médias — le privé est le défaut (ADR-0029 §3).
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
    }

    protected function uploadFor(User $user): int
    {
        Sanctum::actingAs($user);
        $response = $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('pic.jpg', 300, 300),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertCreated();

        return (int) $response->json('data.id');
    }

    public function test_owner_can_delete_own_media(): void
    {
        $owner = User::factory()->create();
        $id = $this->uploadFor($owner);

        // Re-authenticate to ensure session is fresh.
        Sanctum::actingAs($owner);
        $this->deleteJson("/api/media/{$id}")->assertNoContent();

        $this->assertDatabaseMissing('media', ['id' => $id]);
    }

    public function test_non_owner_cannot_delete_media(): void
    {
        $owner = User::factory()->create();
        $id = $this->uploadFor($owner);

        $intruder = User::factory()->create();
        Sanctum::actingAs($intruder);
        $this->deleteJson("/api/media/{$id}")->assertForbidden();

        $this->assertDatabaseHas('media', ['id' => $id]);
    }

    public function test_super_admin_can_delete_any_media(): void
    {

        $owner = User::factory()->create();
        $id = $this->uploadFor($owner);

        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/media/{$id}")->assertNoContent();
    }

    public function test_delete_removes_file_from_disk(): void
    {
        $owner = User::factory()->create();
        $id = $this->uploadFor($owner);

        /** @var Media $media */
        $media = Media::findOrFail($id);
        $path = $media->getPathRelativeToRoot();
        Storage::disk(config('media-library.disk_name'))->assertExists($path);

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/media/{$id}")->assertNoContent();

        Storage::disk(config('media-library.disk_name'))->assertMissing($path);
    }

    public function test_guest_cannot_delete(): void
    {
        $owner = User::factory()->create();
        $id = $this->uploadFor($owner);

        // Log out.
        $this->app['auth']->forgetGuards();

        $this->deleteJson("/api/media/{$id}")->assertUnauthorized();
    }
}
