<?php

namespace Tests\Feature\Media;

use App\Models\User;
use App\Policies\BasePolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MediaUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // TCK-538 : les deux disques de médias — le privé est le défaut (ADR-0029 §3).
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
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

    /**
     * TCK-763 (P10.07) — entre 10 et 25 Mo, un document passait la validation, puis Spatie levait
     * `FileIsTooBig` (`media-library.max_file_size` = 10 Mo) : 500. La validation suit le plafond.
     */
    public function test_rejects_a_document_above_the_media_library_cap(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            // Des octets réels : `fake()->create()` annonce une taille, mais le fichier est vide,
            // et Spatie mesure le fichier.
            'file' => UploadedFile::fake()->createWithContent('scan.pdf', "%PDF-1.4\n".str_repeat('0', 15 * 1024 * 1024)),
            'collection' => 'documents',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['file']);

        $this->assertDatabaseCount('media', 0);
    }

    /** TCK-763 (P10.07) — un fichier que la médiathèque refuse rend 422 et un code, jamais 500. */
    public function test_a_file_refused_by_the_media_library_is_a_422(): void
    {
        config(['media-library.max_file_size' => 100 * 1024]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->createWithContent('contract.pdf', "%PDF-1.4\n".str_repeat('0', 200 * 1024)),
            'collection' => 'documents',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertStatus(422)
            ->assertJsonPath('code', 'media.file_rejected')
            ->assertJsonPath('message', __('errors.media.file_rejected'));

        $this->assertDatabaseCount('media', 0);
    }

    /**
     * TCK-764 (P10.08) — `POST /api/media/upload` n'avait aucun appelant : tout compte y déposait
     * 30 fichiers par minute dans ses propres `photos` ou `documents`, que rien ne lit ni ne
     * nettoie. La route est retirée ; `POST /api/media` reste.
     */
    public function test_the_generic_upload_route_is_gone(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->assertFalse(Route::has('media.upload'));
        // 405 et non 404 : `DELETE media/{media}` couvre le même chemin.
        $status = $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('hero.jpg', 400, 400),
            'collection' => 'photos',
        ])->status();
        $this->assertContains($status, [404, 405]);

        $this->assertDatabaseCount('media', 0);
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
