<?php

namespace Tests\Feature\Api;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ImageEnTete;
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
            // TCK-676 — la photo en échec est nommée par son rang.
            ->assertJsonValidationErrors(['photos.0']);

        $this->assertSame(0, $property->refresh()->getMedia('photos')->count());
    }

    /**
     * TCK-676 (P10.01) — une photo que GD ne décode pas échoue APRÈS l'écriture de sa ligne et
     * la copie de son original (`FileAdder::processMediaItem`), dans la miniature synchrone. Le
     * `catch` appelait `$media?->delete()` sur un `$media` toujours nul : la ligne restait, sans
     * miniature, et la copie de l'original restait dans le répertoire temporaire de conversion.
     *
     * Le faux PNG de `test_corrupted_image_…` échoue à la règle `image` et n'atteint jamais ce
     * `catch` : celui-ci a un en-tête valide et un corps illisible.
     */
    public function test_photo_that_fails_conversion_is_removed_and_listed_while_the_others_stay(): void
    {
        Storage::fake('public');
        Storage::fake(config('media-library.disk_name'));
        $temp = storage_path('framework/testing/media-temp-'.uniqid());
        config(['media-library.temporary_directory_path' => $temp]);

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $response = $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [
                UploadedFile::fake()->image('good.jpg'),
                $this->truncatedPng('broken.png'),
                UploadedFile::fake()->image('after.jpg'),
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['photos.1'])
            ->assertJsonMissingValidationErrors(['photos.0', 'photos.2']);

        $names = $property->refresh()->getMedia('photos')->pluck('file_name')->all();
        $this->assertSame(['good.jpg', 'after.jpg'], $names);
        $this->assertSame([], glob($temp.'/*') ?: []);

        File::deleteDirectory($temp);
    }

    /** En-tête PNG valide (signature + IHDR 64×64), corps à zéro : `image` passe, GD échoue. */
    private function truncatedPng(string $name): UploadedFile
    {
        $image = imagecreatetruecolor(64, 64);
        ob_start();
        imagepng($image);
        $png = (string) ob_get_clean();

        $path = tempnam(sys_get_temp_dir(), 'png');
        file_put_contents($path, substr($png, 0, 33).str_repeat("\0", 2048));

        return new UploadedFile($path, $name, 'image/png', null, true);
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

    /**
     * TCK-677 (P10.02) — une photo de plus de 20 Mpx est refusée À LA VALIDATION, sur son en-tête,
     * avant que la miniature synchrone ne la décode en entier. Le fichier ne porte que son en-tête
     * (9 000 × 9 000 annoncés, quelques octets) : c'est la forme d'une bombe de décompression.
     */
    public function test_photo_above_twenty_megapixels_returns_422_before_any_media(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('ok.jpg', 10, 10), ImageEnTete::png(9000, 9000, 'bombe.png')],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['photos.1' => __('validation.dimensions', ['attribute' => 'photos.1'])])
            ->assertJsonMissingValidationErrors(['photos.0']);

        $this->assertSame(0, $property->refresh()->getMedia('photos')->count());
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

    /** TCK-892 (P10.09) — `version_urls` suffixe `?v=<updated_at>` : déplacer une photo ne change pas son URL. */
    public function test_reordering_keeps_the_photo_urls(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        Sanctum::actingAs($owner);

        $r1 = $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('a.jpg')],
        ])->json('data.0.id');
        $r2 = $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('b.jpg')],
        ])->json('data.0.id');
        $before = collect($this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data'))->keyBy('id');

        $this->travel(5)->minutes();
        $this->putJson("/api/properties/{$property->id}/media/reorder", ['order' => [$r2, $r1]])->assertOk();

        $after = collect($this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data'))->keyBy('id');
        $this->assertSame(1, $after[$r2]['order']);
        $this->assertSame(2, $after[$r1]['order']);
        foreach ([$r1, $r2] as $id) {
            foreach (['thumbnail', 'preview', 'full', 'original'] as $key) {
                $this->assertSame($before[$id][$key], $after[$id][$key], "L'URL {$key} de la photo {$id} a changé au réordonnancement.");
            }
        }
    }
}
