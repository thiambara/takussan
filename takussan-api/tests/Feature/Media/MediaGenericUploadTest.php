<?php

namespace Tests\Feature\Media;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Covers the generic, non-coupled POST /api/media/upload endpoint: any
 * authenticated user may upload a file. The resulting Media row is attached
 * to the caller as owner.
 */
class MediaGenericUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_authenticated_user_can_upload_generic_photo(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('hero.jpg', 400, 400),
            'collection' => 'photos',
        ]);

        $response->assertCreated()
            ->assertJsonStructure([
                'data' => ['id', 'collection_name', 'file_name', 'mime_type', 'size', 'url', 'conversions'],
            ])
            ->assertJsonPath('data.collection_name', 'photos')
            ->assertJsonPath('data.model_type', User::class)
            ->assertJsonPath('data.model_id', $user->id);

        $this->assertDatabaseCount('media', 1);
    }

    public function test_collection_defaults_to_photos_when_omitted(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('untitled.png'),
        ])->assertCreated()
            ->assertJsonPath('data.collection_name', 'photos');
    }

    public function test_guest_cannot_upload(): void
    {
        $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'photos',
        ])->assertUnauthorized();
    }

    public function test_rejects_oversized_photo(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('huge.jpg')->size(11 * 1024),
            'collection' => 'photos',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    public function test_rejects_unsupported_mime(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->create('bad.exe', 10, 'application/octet-stream'),
            'collection' => 'photos',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    public function test_rejects_invalid_collection(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'bogus',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['collection']);
    }

    public function test_pdf_upload_to_documents_is_accepted(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->create('contract.pdf', 200, 'application/pdf'),
            'collection' => 'documents',
        ])->assertCreated()
            ->assertJsonPath('data.collection_name', 'documents');
    }
}
