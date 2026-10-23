<?php

namespace Tests\Feature\Media;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

class MediaConversionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // TCK-538 : les deux disques de médias — le privé est le défaut (ADR-0029 §3).
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
    }

    public function test_has_media_conversions_trait_registers_three_conversions(): void
    {
        $user = User::factory()->make();
        $user->registerAllMediaConversions();

        $names = array_map(fn ($c) => $c->getName(), $user->mediaConversions);

        $this->assertContains('thumbnail', $names);
        $this->assertContains('preview', $names);
        $this->assertContains('full', $names);
    }

    /**
     * Sous la file `sync` de la suite (`phpunit.xml`), les trois conversions sont faites pendant la
     * requête : ce test garde qu'elles se produisent et s'exposent, pas ce que la réponse rend sur
     * un serveur — c'est le test suivant (TCK-1760).
     */
    public function test_uploading_image_generates_thumbnail_preview_full_urls(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg', 1600, 1200),
            // `avatars` et non `photos` : `User.photos` est privée (TCK-538), et une conversion
            // privée n'a pas d'URL à exposer (TCK-545). Les URL de conversion se mesurent sur
            // une collection PUBLIQUE.
            'collection' => 'avatars',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertCreated();

        $id = (int) $response->json('data.id');
        /** @var Media $media */
        $media = Media::findOrFail($id);

        $this->assertTrue($media->hasGeneratedConversion('thumbnail'));
        $this->assertTrue($media->hasGeneratedConversion('preview'));
        $this->assertTrue($media->hasGeneratedConversion('full'));

        $this->assertNotEmpty($media->getUrl('thumbnail'));
        $this->assertNotEmpty($media->getUrl('preview'));
        $this->assertNotEmpty($media->getUrl('full'));

        $this->assertNotNull($response->json('data.conversions.thumbnail'));
        $this->assertNotNull($response->json('data.conversions.preview'));
        $this->assertNotNull($response->json('data.conversions.full'));
    }

    /**
     * TCK-1760 (P156.02) — le contrat RÉEL de la réponse, sous la file de développement et de
     * préproduction (`database`) : seule `thumbnail` est `nonQueued` ; `preview` et `full` partent
     * en file `media` et arrivent avec le worker. Le test ci-dessus, joué sous la file `sync` de la
     * suite, décrit un régime qu'aucun serveur n'a.
     */
    public function test_sous_une_file_reelle_la_reponse_ne_promet_que_la_vignette(): void
    {
        config()->set('queue.default', 'database');
        config()->set('media-library.queue_connection_name', 'database');
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.jpg', 1600, 1200),
            'collection' => 'avatars',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertCreated();

        $this->assertNotNull($response->json('data.conversions.thumbnail'));
        $this->assertNull($response->json('data.conversions.preview'));
        $this->assertNull($response->json('data.conversions.full'));
        $this->assertSame(1, DB::table('jobs')->where('queue', config('media-library.queue_name'))->count());

        $this->artisan('queue:work', [
            'connection' => 'database',
            '--queue' => config('media-library.queue_name'),
            '--stop-when-empty' => true,
        ])->assertSuccessful();

        $media = Media::findOrFail((int) $response->json('data.id'));
        $this->assertTrue($media->hasGeneratedConversion('preview'));
        $this->assertTrue($media->hasGeneratedConversion('full'));
    }

    public function test_resource_exposes_original_url(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('hero.png'),
            'collection' => 'photos',
            'model_type' => User::class,
            'model_id' => $user->id,
        ])->assertCreated();

        $this->assertNotEmpty($response->json('data.url'));
    }
}
