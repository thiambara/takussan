<?php

namespace Tests\Feature\Media;

use App\Models\Address;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\PublicPhotoUrl;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-539 — la fenêtre entre l'upload et le passage de `worker-media`.
 *
 * `preview` et `full` sont en file : juste après l'upload, seule `thumbnail` existe. Avant ce
 * correctif, l'API rendait les URL de `preview` et `full` quand même — `getUrl()` les construit
 * d'après le NOM de la conversion — et la fiche publique affichait des tuiles en 404.
 *
 * `Queue::fake()` retient les conversions en file : c'est l'état exact de la production entre
 * l'upload et le worker (ou indéfiniment, worker arrêté). Chaque URL rendue est vérifiée SUR LE
 * DISQUE, `r2-media` simulé distant — une URL qui ne mène à rien est précisément le défaut.
 */
class PublicPhotoUrlTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $disk;

    private FilesystemAdapter $private;

    protected function setUp(): void
    {
        parent::setUp();

        $this->disk = RemoteDiskFake::install('r2-media');
        // TCK-539 (D2) — l'original d'une photo vit sur le disque PRIVÉ, distant lui aussi.
        $this->private = RemoteDiskFake::install('r2-private');
    }

    /** @return array{0: Property, 1: Media} */
    private function bienPublieAvecPhotoFraiche(): array
    {
        Queue::fake();

        $property = Property::factory()->published()->create();

        $media = $property->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))
            ->usingFileName('villa.jpg')
            ->toMediaCollection('photos')
            ->refresh();

        $this->assertTrue($media->hasGeneratedConversion('thumbnail'), 'Précondition : `thumbnail` est synchrone.');
        $this->assertFalse($media->hasGeneratedConversion('preview'), 'Précondition : `preview` est encore en file.');
        $this->assertFalse($media->hasGeneratedConversion('full'), 'Précondition : `full` est encore en file.');

        return [$property, $media];
    }

    /** L'URL rendue doit mener à un fichier présent sur le disque de la conversion. */
    private function assertServed(Media $media, ?string $url, string $key): void
    {
        $this->assertNotNull($url, "`{$key}` ne doit pas être nul : `thumbnail` existe.");

        $served = collect(['thumbnail', 'preview', 'full'])
            ->first(fn (string $c) => $media->getUrl($c) === $url);

        $this->assertNotNull($served, "`{$key}` doit être une conversion filigranée, jamais l'original : {$url}");
        $this->assertTrue(
            $this->disk->exists($media->getPathRelativeToRoot($served)),
            "`{$key}` pointe sur `{$served}`, absente du disque : c'est une tuile en 404."
        );
    }

    private function sansAucuneConversion(Media $media): void
    {
        $media->generated_conversions = [];
        $media->save();
    }

    private function detail(Property $property): TestResponse
    {
        return $this->getJson('/api/public/properties/'.$property->slug)->assertOk();
    }

    public function test_public_detail_serves_the_thumbnail_until_the_worker_runs(): void
    {
        [$property, $media] = $this->bienPublieAvecPhotoFraiche();

        $photo = $this->detail($property)->json('data.photos.0');

        foreach (['thumbnail', 'preview', 'full', 'original'] as $key) {
            $this->assertSame($media->getUrl('thumbnail'), $photo[$key], "`{$key}` doit se replier sur `thumbnail`.");
            $this->assertServed($media, $photo[$key], $key);
        }

        $this->assertNotSame($media->getUrl(), $photo['original'], "Jamais l'original sans `viewRaw` (TCK-106).");
        $this->assertSame($media->getUrl('thumbnail'), $this->detail($property)->json('data.main_photo_url'));
    }

    /** Le repli ne masque rien : une fois le worker passé, chaque clé rend sa conversion. */
    public function test_each_key_serves_its_own_conversion_once_generated(): void
    {
        [$property, $media] = $this->bienPublieAvecPhotoFraiche();

        $media->markAsConversionGenerated('preview');
        $media->markAsConversionGenerated('full');
        $media->refresh();

        $photo = $this->detail($property)->json('data.photos.0');

        $this->assertSame($media->getUrl('thumbnail'), $photo['thumbnail']);
        $this->assertSame($media->getUrl('preview'), $photo['preview']);
        $this->assertSame($media->getUrl('full'), $photo['full']);
        $this->assertSame($media->getUrl('full'), $photo['original']);
    }

    /**
     * Sans aucune conversion, la photo sort de la galerie publique plutôt que d'y entrer
     * avec `full: null` : la galerie passe `photo.full` à `next/image` sans le vérifier.
     * `main_photo_url` rend `null`, que les cartes gèrent (`PropertyPhoto` → `bg-muted`).
     */
    public function test_a_photo_without_any_conversion_is_left_out_rather_than_broken(): void
    {
        [$property, $media] = $this->bienPublieAvecPhotoFraiche();
        $this->sansAucuneConversion($media);

        $reponse = $this->detail($property);

        $this->assertSame([], $reponse->json('data.photos'));
        $this->assertNull($reponse->json('data.main_photo_url'));
    }

    public function test_upload_response_serves_the_thumbnail_for_every_size(): void
    {
        Queue::fake();

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        Sanctum::actingAs($owner);

        $data = $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('photo.jpg', 2000, 1500)],
        ])->assertCreated()->json('data.0');

        $media = Media::findOrFail($data['id']);

        foreach (['thumbnail', 'preview', 'full'] as $key) {
            $this->assertSame($media->getUrl('thumbnail'), $data[$key], "`{$key}` doit se replier sur `thumbnail`.");
            $this->assertServed($media, $data[$key], $key);
        }
    }

    /**
     * Conversions jouées pendant la requête (`QUEUE_CONNECTION=sync`, toute file synchrone
     * en fait autant) : la réponse doit rendre `full`. L'instance de `addMedia()` ne le voit
     * pas — le job de conversion travaille sur sa copie — d'où le `refresh()` du contrôleur.
     */
    public function test_upload_response_serves_full_when_conversions_ran_during_the_request(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        Sanctum::actingAs($owner);

        $data = $this->postJson("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('photo.jpg', 2000, 1500)],
        ])->assertCreated()->json('data.0');

        $media = Media::findOrFail($data['id']);

        $this->assertSame($media->getUrl('full'), $data['full']);
        $this->assertSame($media->getUrl('preview'), $data['preview']);
        $this->assertServed($media, $data['full'], 'full');
    }

    public function test_console_listing_serves_the_thumbnail_and_null_without_any_conversion(): void
    {
        Queue::fake();

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        Sanctum::actingAs($owner);

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg', 2000, 1500))->toMediaCollection('photos')->refresh();

        $data = $this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data.0');
        $this->assertSame($media->getUrl('thumbnail'), $data['full']);
        $this->assertSame($media->getUrl('thumbnail'), $data['preview']);

        // La console garde la photo — son propriétaire doit pouvoir la supprimer — mais
        // sans URL en 404 : `null`.
        $this->sansAucuneConversion($media);
        $data = $this->getJson("/api/properties/{$property->id}/media")->assertOk()->json('data.0');

        $this->assertNull($data['thumbnail']);
        $this->assertNull($data['preview']);
        $this->assertNull($data['full']);
    }

    public function test_conversation_header_serves_the_thumbnail(): void
    {
        [$property, $media] = $this->bienPublieAvecPhotoFraiche();
        Sanctum::actingAs(User::factory()->create());

        $url = $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertOk()
            ->json('data.property.main_photo_url');

        $this->assertSame($media->getUrl('thumbnail'), $url);
        $this->assertServed($media, $url, 'main_photo_url');
    }

    public function test_map_thumbnail_is_null_rather_than_a_404(): void
    {
        [$property, $media] = $this->bienPublieAvecPhotoFraiche();
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
            'country' => 'SN',
            'latitude' => 14.7,
            'longitude' => -17.5,
        ]);

        $carte = fn () => $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0')
            ->assertOk()
            ->json('features.0.properties.thumbnail');

        $this->assertSame($media->getUrl('thumbnail'), $carte());

        $this->sansAucuneConversion($media);

        $this->assertNull($carte());
    }

    /**
     * Le repli ne doit atterrir que sur une conversion filigranée : une conversion hors de
     * `watermarkedConversions()` servirait une image nue sur la surface publique.
     */
    public function test_fallback_chain_is_exactly_the_watermarked_conversions(): void
    {
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), PublicPhotoUrl::FALLBACK_CHAIN);
    }
}
