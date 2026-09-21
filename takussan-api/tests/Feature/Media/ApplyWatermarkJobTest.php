<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Listeners\Media\ApplyWatermarkOnConversionListener;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Media\WatermarkService;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Spatie\MediaLibrary\Conversions\Conversion;
use Spatie\MediaLibrary\Conversions\Events\ConversionHasBeenCompletedEvent;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

class ApplyWatermarkJobTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $disk;

    private FilesystemAdapter $private;

    private string $temporaryDirectory;

    protected function setUp(): void
    {
        parent::setUp();
        // TCK-539 — le disque public NOMMÉ comme en production et DISTANT (`path()` ne mène à
        // aucun fichier) : un faux local laisserait passer `getPath()`, le défaut même.
        $this->disk = RemoteDiskFake::install('r2-media');
        // TCK-539 (D2) — l'original d'une photo vit sur le disque PRIVÉ, distant lui aussi.
        $this->private = RemoteDiskFake::install('r2-private');
        config([
            'media-library.temporary_directory_path' => $this->temporaryDirectory = storage_path('framework/testing/watermark-tmp-'.TestProcessToken::value()),
        ]);
        Queue::fake();
    }

    protected function tearDown(): void
    {
        (new Filesystem)->deleteDirectory($this->temporaryDirectory);

        parent::tearDown();
    }

    private function createAgencyWithProperty(array $settings = []): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create([
            'primary_admin_id' => $admin->id,
            'settings' => array_merge(['watermark_enabled' => true], $settings),
        ]);
        $admin->update(['agency_id' => $agency->id]);

        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $admin->id,
        ]);

        return [$admin, $agency, $property];
    }

    private function fakeConversionEvent(Media $media, string $conversionName): ConversionHasBeenCompletedEvent
    {
        $conversion = Mockery::mock(Conversion::class);
        $conversion->shouldReceive('getName')->andReturn($conversionName);

        return new ConversionHasBeenCompletedEvent($media, $conversion);
    }

    public function test_listener_dispatches_job_when_property_photo_uploaded(): void
    {
        [, , $property] = $this->createAgencyWithProperty();

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        $event = $this->fakeConversionEvent($media, 'thumbnail');

        $listener = new ApplyWatermarkOnConversionListener;
        $listener->handle($event);

        Queue::assertPushed(ApplyWatermarkJob::class, fn ($job) => $job->mediaId === $media->id
            && $job->conversionName === 'thumbnail');
    }

    public function test_listener_does_not_dispatch_when_watermark_disabled(): void
    {
        [, , $property] = $this->createAgencyWithProperty(['watermark_enabled' => false]);

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        Queue::fake();

        $event = $this->fakeConversionEvent($media, 'thumbnail');

        $listener = new ApplyWatermarkOnConversionListener;
        $listener->handle($event);

        Queue::assertNothingPushed();
    }

    public function test_listener_does_not_dispatch_for_avatar_or_lease_collection(): void
    {
        $user = User::factory()->create();

        $avatarMedia = $user->addMedia(UploadedFile::fake()->image('avatar.jpg'))
            ->usingFileName('avatar.jpg')
            ->toMediaCollection('avatar');

        Queue::fake();

        $event = $this->fakeConversionEvent($avatarMedia, 'thumbnail');

        $listener = new ApplyWatermarkOnConversionListener;
        $listener->handle($event);

        Queue::assertNothingPushed();
    }

    /**
     * TCK-539 — le job lit la conversion PAR SON DISQUE, la filigrane, et la réécrit au MÊME
     * chemin sur le MÊME disque. Éprouvé sur `r2-media` simulé par `RemoteDiskFake`, dont le
     * `path()` ne mène à aucun fichier : rétablir `getPath()` rend ce test rouge (ablation
     * notée dans TCK-539).
     */
    public function test_job_watermarks_the_conversion_in_place_on_the_remote_disk(): void
    {
        [, , $property] = $this->createAgencyWithProperty();
        $media = $this->uploadPhoto($property);

        $path = $media->getPathRelativeToRoot('thumbnail');
        $this->assertTrue($this->disk->exists($path), 'Précondition : `thumbnail` est synchrone, donc présent après l\'upload.');
        $this->assertFileDoesNotExist($media->getPath('thumbnail'), 'Précondition : le faux est bien DISTANT — `getPath()` ne mène à aucun fichier.');

        $before = $this->disk->get($path);
        $filesBefore = $this->disk->allFiles();

        (new ApplyWatermarkJob($media->id, 'thumbnail'))->handle(new WatermarkService);

        $after = $this->disk->get($path);
        $this->assertNotSame($before, $after, 'La conversion doit être réécrite, filigranée, sur son disque.');
        $this->assertSame(array_slice(getimagesizefromstring($before), 0, 2), array_slice(getimagesizefromstring($after), 0, 2), 'Même image, mêmes dimensions : réécrite, pas remplacée.');
        $this->assertEqualsCanonicalizing($filesBefore, $this->disk->allFiles(), 'Réécrite au MÊME chemin : aucun fichier ajouté ni retiré.');
        $this->assertContains('thumbnail', $media->fresh()->getCustomProperty('watermarked_conversions', []));
        $this->assertSame([], glob($this->temporaryDirectory.'/*'), 'Le fichier temporaire doit être supprimé.');
    }

    /**
     * Idempotence, EN OCTETS : un second passage ne filigrane pas deux fois. Le mock qui
     * gardait cette propriété ne voyait que l'appel ; ce test voit le fichier.
     */
    public function test_job_does_not_watermark_twice(): void
    {
        [, , $property] = $this->createAgencyWithProperty();
        $media = $this->uploadPhoto($property);
        $path = $media->getPathRelativeToRoot('thumbnail');

        (new ApplyWatermarkJob($media->id, 'thumbnail'))->handle(new WatermarkService);
        $once = $this->disk->get($path);

        (new ApplyWatermarkJob($media->id, 'thumbnail'))->handle(new WatermarkService);

        $this->assertSame($once, $this->disk->get($path));
    }

    /**
     * Une conversion absente de son disque : le job sort sans la marquer, pour qu'un passage
     * ultérieur — une fois la conversion produite — la filigrane encore.
     */
    public function test_job_leaves_a_missing_conversion_unmarked(): void
    {
        [, , $property] = $this->createAgencyWithProperty();
        $media = $this->uploadPhoto($property);

        $this->assertFalse($this->disk->exists($media->getPathRelativeToRoot('full')), 'Précondition : `full` est en file, pas encore produite.');

        (new ApplyWatermarkJob($media->id, 'full'))->handle(new WatermarkService);

        $this->assertNotContains('full', $media->fresh()->getCustomProperty('watermarked_conversions', []));
    }

    /**
     * ADR-0029 §6 — l'URL change après le filigrane, MÊME dans la seconde de l'upload.
     *
     * `?v=` porte `updated_at` à la seconde. La conversion nue a pu être servie — donc mise en
     * cache par Cloudflare — sous l'URL d'avant ; si le filigrane rendait la même, le cache
     * servirait l'image nue. L'horloge est figée : sans le correctif, `save()` réécrit
     * `updated_at` à la même seconde et l'URL ne bouge pas.
     */
    public function test_watermarking_changes_the_versioned_url_within_the_same_second(): void
    {
        $this->freezeSecond();

        [, , $property] = $this->createAgencyWithProperty();
        $media = $this->uploadPhoto($property);
        $urlBefore = $media->getUrl('thumbnail');

        $this->assertStringContainsString('?v=', $urlBefore, 'Précondition : `version_urls` est actif.');

        (new ApplyWatermarkJob($media->id, 'thumbnail'))->handle(new WatermarkService);

        $this->assertNotSame($urlBefore, $media->fresh()->getUrl('thumbnail'));
    }

    /**
     * TCK-539 — le logo est lu PAR SON DISQUE. `getFirstMediaPath('logo')` rendait un chemin
     * local qui n'existe pas sur R2 : le filigrane partait sans logo, sans erreur.
     */
    public function test_agency_logo_is_read_from_its_remote_disk(): void
    {
        [, $agency] = $this->createAgencyWithProperty();
        $logo = UploadedFile::fake()->image('logo.png', 120, 40);
        $bytes = file_get_contents($logo->getRealPath());

        $media = $agency->addMedia($logo)->toMediaCollection('logo');

        $this->assertSame('r2-media', $media->disk, 'Précondition : le logo vit sur le disque public.');
        $this->assertSame($bytes, AgencyWatermarkContext::fromAgency($agency->fresh())->logo);
    }

    public function test_agency_without_logo_has_no_logo_in_context(): void
    {
        [, $agency] = $this->createAgencyWithProperty();

        $this->assertNull(AgencyWatermarkContext::fromAgency($agency)->logo);
    }

    private function uploadPhoto(Property $property): Media
    {
        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg', 800, 600))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        $this->assertSame('r2-media', $media->conversions_disk, 'Précondition : les conversions vivent sur le disque distant.');

        return $media->refresh();
    }
}
