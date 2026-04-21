<?php

namespace Tests\Feature\Media;

use App\Models\User;
use App\Policies\BasePolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MediaUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_authenticated_user_can_upload_photo_to_own_model(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg', 400, 400),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
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

    public function test_guest_cannot_upload(): void
    {
        $user = User::factory()->create();

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertUnauthorized();
    }

    public function test_rejects_unsupported_mime(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->create('bad.exe', 10, 'application/octet-stream'),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    public function test_rejects_oversized_photo(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        // 11 MB photo → above 10 MB cap.
        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('huge.jpg')->size(11 * 1024),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    public function test_rejects_oversized_document(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        // 26 MB PDF → above 25 MB document cap.
        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->create('huge.pdf', 26 * 1024, 'application/pdf'),
            'collection' => 'documents',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    public function test_rejects_invalid_collection(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'bogus',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['collection']);
    }

    public function test_pdf_upload_to_documents_collection_is_accepted(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->create('contract.pdf', 200, 'application/pdf'),
            'collection' => 'documents',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertCreated()
            ->assertJsonPath('data.collection_name', 'documents');
    }

    public function test_cannot_upload_to_unsupported_model_class(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'photos',
            'model_type' => 'Totally\\Bogus\\Class',
            'model_id' => 1,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['model_type']);
    }

    public function test_cannot_upload_to_another_users_target_without_permission(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        Sanctum::actingAs($intruder);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $owner->id,
        ])->assertForbidden();
    }

    public function test_cannot_upload_to_non_hasmedia_class_without_instantiating_it(): void
    {
        // Regression: the validator must reject a class that doesn't implement
        // HasMedia *without* calling `new $type` on the user-supplied string —
        // arbitrary class instantiation is a code-execution vector. Passing
        // an abstract class proves no instantiation happens (instantiating an
        // abstract class throws an Error, which would surface as a 500).
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg'),
            'collection' => 'photos',
            'model_type' => BasePolicy::class,
            'model_id' => 1,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['model_type']);
    }
}
