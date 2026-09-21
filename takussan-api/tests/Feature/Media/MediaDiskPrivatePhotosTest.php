<?php

namespace Tests\Feature\Media;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\PdfImageEmbedder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-538 — les photos d'inventaire et de maintenance sont PRIVÉES : ni le PDF
 * d'état des lieux ni les réponses d'upload ne peuvent plus passer par `getUrl()`,
 * qu'aucun serveur ne sert sur `r2-private`. Éprouvé sur un disque distant simulé,
 * dont `path()` est relatif comme sur S3.
 */
class MediaDiskPrivatePhotosTest extends TestCase
{
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');
    }

    public function test_the_inventory_pdf_embeds_room_photos_read_from_the_private_disk(): void
    {
        [$owner, $inventory] = $this->signedInventory();
        $media = $inventory->addMedia(UploadedFile::fake()->image('salon.jpg', 1600, 1200))
            ->withCustomProperties(['room_name' => 'Salon'])
            ->toMediaCollection('room_photos');
        $this->assertSame('r2-private', $media->disk);

        $captured = null;
        View::composer('pdf.inventories.report', function ($view) use (&$captured) {
            $captured = $view->getData()['room_photos'];
        });

        Sanctum::actingAs($owner);
        $this->get("/api/inventories/{$inventory->id}/pdf")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');

        $this->assertSame(['Salon'], array_keys($captured));
        $this->assertCount(1, $captured['Salon']);
        $this->assertStringStartsWith('data:image/jpeg;base64,', $captured['Salon'][0]);

        // Réduite pour le PDF : jamais l'original à 1600 px.
        $bytes = base64_decode(substr($captured['Salon'][0], strlen('data:image/jpeg;base64,')), true);
        $this->assertLessThanOrEqual(600, getimagesizefromstring($bytes)[0]);
    }

    public function test_the_embedder_prefers_a_generated_conversion_over_the_original(): void
    {
        // `User.photos` : privée, et `User` déclare `preview` (HasMediaConversions) — les photos
        // d'inventaire et de maintenance n'ont aujourd'hui aucune conversion.
        $media = User::factory()->create()
            ->addMedia(UploadedFile::fake()->image('cuisine.jpg', 900, 900))
            ->toMediaCollection('photos')
            ->refresh();
        $this->assertTrue($media->hasGeneratedConversion('preview'));

        $preview = Storage::disk('r2-private')->get($media->getPathRelativeToRoot('preview'));

        $this->assertSame(
            'data:image/jpeg;base64,'.base64_encode($preview),
            app(PdfImageEmbedder::class)->dataUri($media),
        );
    }

    public function test_the_embedder_skips_what_is_not_an_image_or_cannot_be_read(): void
    {
        [, $inventory] = $this->signedInventory();
        $pdf = $inventory->addMedia(UploadedFile::fake()->create('plan.pdf', 5, 'application/pdf'))
            ->toMediaCollection('room_photos');
        $gone = $inventory->addMedia(UploadedFile::fake()->image('perdue.jpg'))
            ->toMediaCollection('room_photos');

        $this->assertNull(app(PdfImageEmbedder::class)->dataUri($pdf));

        Storage::disk('r2-private')->delete($gone->getPathRelativeToRoot());
        $this->assertNull(app(PdfImageEmbedder::class)->dataUri($gone));
    }

    public function test_room_photo_upload_returns_signed_api_urls_that_redirect_to_a_short_presigned_url(): void
    {
        [$owner, $inventory] = $this->signedInventory(signed: false);

        Sanctum::actingAs($owner);
        $url = $this->postJson("/api/inventories/{$inventory->id}/room-photos", [
            'photos' => [UploadedFile::fake()->image('chambre.jpg')],
            'room_name' => 'Chambre',
        ])->assertOk()->json('data.0.url');

        $this->assertPrivateMediaUrl($url, Media::query()->sole());
    }

    public function test_maintenance_photo_upload_returns_signed_api_urls(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $owner->id,
        ]);

        Sanctum::actingAs($owner);
        $url = $this->postJson("/api/maintenance-requests/{$mr->id}/photos", [
            'photos' => [UploadedFile::fake()->image('fuite.jpg')],
        ])->assertCreated()->json('data.0.url');

        $this->assertPrivateMediaUrl($url, Media::query()->sole());
    }

    /** TCK-545 — `MediaResource` décide sur le DISQUE : privé → URL signée, conversions tues. */
    public function test_generic_upload_of_a_private_collection_returns_a_signed_url(): void
    {
        Storage::fake(config('media-library.public_disk_name'));
        Sanctum::actingAs(User::factory()->create());

        $response = $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('papier.jpg', 900, 900),
            'collection' => 'photos',
        ])->assertCreated();

        $this->assertPrivateMediaUrl($response->json('data.url'), Media::query()->sole());
        $this->assertSame(
            ['thumbnail' => null, 'preview' => null, 'full' => null],
            $response->json('data.conversions'),
        );
    }

    /** Témoin : un média du disque PUBLIC garde son URL publique et ses conversions. */
    public function test_generic_upload_of_a_public_collection_keeps_its_public_url(): void
    {
        Storage::fake(config('media-library.public_disk_name'));
        Sanctum::actingAs(User::factory()->create());

        $response = $this->postJson('/api/media/upload', [
            'file' => UploadedFile::fake()->image('moi.jpg', 900, 900),
            'collection' => 'avatars',
        ])->assertCreated();

        $media = Media::query()->sole();
        $this->assertSame(config('media-library.public_disk_name'), $media->disk);
        $this->assertSame($media->getUrl(), $response->json('data.url'));
        $this->assertStringNotContainsString('signature=', $response->json('data.url'));
        $this->assertNotNull($response->json('data.conversions.thumbnail'));
    }

    private function assertPrivateMediaUrl(string $url, Media $media): void
    {
        $this->assertSame('r2-private', $media->disk);
        $this->assertStringContainsString("/api/media/{$media->id}/file?", $url);
        $this->assertStringContainsString('signature=', $url);
        $this->assertStringNotContainsString('/storage/', $url);

        // La cible redirige vers une URL présignée du seau, à 5 minutes.
        $location = $this->get($url)->assertRedirect()->headers->get('Location');
        $this->assertStringStartsWith(RemoteDiskFake::PRESIGNED_HOST."/r2-private/{$media->getPathRelativeToRoot()}?", $location);
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
        $this->assertEqualsWithDelta(now()->addMinutes(5)->getTimestamp(), (int) $query['expires'], 5);
    }

    /** @return array{0: User, 1: Inventory} */
    private function signedInventory(bool $signed = true): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id]);

        $factory = $signed ? Inventory::factory()->signed() : Inventory::factory()->pendingSignature();
        $inventory = $factory->create(array_merge([
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ], $signed ? [
            'tenant_signature_data' => self::SIGNATURE,
            'owner_signature_data' => self::SIGNATURE,
        ] : []));

        return [$owner, $inventory];
    }
}
