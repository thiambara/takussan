<?php

namespace Tests\Feature\Api;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyMediaTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_upload_photos(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('photo1.jpg')],
        ])->assertStatus(201)
            ->assertJsonStructure(['data' => [['id', 'original']]]);
    }

    public function test_non_owner_cannot_upload_photos(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($other);

        $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('photo.jpg')],
        ])->assertForbidden();
    }

    public function test_invalid_file_type_returns_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->create('document.pdf', 100, 'application/pdf')],
        ])->assertStatus(422);
    }

    public function test_corrupted_image_is_rejected_without_persisting_media(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->create('broken.png', 1, 'image/png')],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['photos']);

        $this->assertSame(0, $property->refresh()->getMedia('photos')->count());
    }

    /**
     * TCK-673 (P10.03) — l'interface annonce 20 photos au plus. Sans borne, la 21e partait vers
     * `max_file_uploads` (20 par défaut), qui l'ignore EN SILENCE : le lot était accepté amputé.
     */
    public function test_more_than_twenty_photos_returns_422_without_persisting_media(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $photos = [];
        for ($i = 1; $i <= 21; $i++) {
            $photos[] = UploadedFile::fake()->image("photo{$i}.jpg", 10, 10);
        }

        $this->postJson("/api/properties/{$property->id}/media", ['photos' => $photos])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos']);

        $this->assertSame(0, $property->refresh()->getMedia('photos')->count());
    }

    /**
     * TCK-673 (P10.03) — la borne de PHP est écrite dans l'image, pas laissée au défaut : elle doit
     * rester celle de la règle `photos` `max:20`, faute de quoi un fichier au-delà disparaît sans
     * erreur avant même la validation.
     */
    public function test_image_php_ini_pins_max_file_uploads_to_twenty(): void
    {
        $ini = parse_ini_file(base_path('docker/php.ini'));

        $this->assertIsArray($ini);
        $this->assertSame('20', $ini['max_file_uploads'] ?? null);
    }

    public function test_missing_photos_returns_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/media", [])
            ->assertStatus(422);
    }

    public function test_owner_can_list_media(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('test.jpg')],
        ])->assertStatus(201);

        $this->getJson("/api/properties/{$property->id}/media")
            ->assertOk()
            ->assertJsonStructure(['data']);
    }

    public function test_owner_can_delete_media(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $uploadResponse = $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('test.jpg')],
        ])->assertStatus(201);

        $mediaId = $uploadResponse->json('data.0.id');

        $this->deleteJson("/api/properties/{$property->id}/media/{$mediaId}")
            ->assertNoContent();
    }

    public function test_owner_can_reorder_media(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $r1 = $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('a.jpg')],
        ])->json('data.0.id');

        $r2 = $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('b.jpg')],
        ])->json('data.0.id');

        $this->putJson("/api/properties/{$property->id}/media/reorder", [
            'order' => [$r2, $r1],
        ])->assertOk();
    }
}
