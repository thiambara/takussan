<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Jobs\Media\RegeneratePhotoConversionsJob;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Queue\SyncQueue;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\MediaLibrary\Conversions\Jobs\PerformConversionsJob;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

class RegenerateAgencyWatermarksJobTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $disk;

    private FilesystemAdapter $private;

    protected function setUp(): void
    {
        parent::setUp();

        // TCK-539 — le disque public nommé comme en production et DISTANT (cf. RemoteDiskFake).
        $this->disk = RemoteDiskFake::install('r2-media');
        // TCK-539 (D2) — l'original d'une photo vit sur le disque PRIVÉ, distant lui aussi.
        $this->private = RemoteDiskFake::install('r2-private');
    }

    private function createAgencyWithPropertyAndMedia(array $settings = []): array
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

        $media = $property->addMedia(UploadedFile::fake()->image('photo.jpg', 1200, 900))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        return [$admin, $agency, $property, $media->refresh()];
    }

    /** @return array<string, string> les octets de chaque conversion filigranée, lus sur le disque distant */
    private function conversionBytes(Media $media): array
    {
        $bytes = [];
        foreach (Property::watermarkedConversions() as $conversion) {
            $bytes[$conversion] = $this->disk->get($media->getPathRelativeToRoot($conversion));
        }

        return $bytes;
    }

    public function test_disabling_watermark_then_running_job_strips_existing_watermarks(): void
    {
        // Le job d'agence ne fait que répartir (V5-1) : le job de chaque photo tourne ici, en ligne.
        Queue::fake()->except([RegeneratePhotoConversionsJob::class]);

        [, $agency, , $media] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);

        $media->setCustomProperty('watermarked_conversions', ['thumbnail', 'preview']);
        $media->save();

        $agency->update(['settings' => ['watermark_enabled' => false]]);
        $jobsAvant = Queue::pushed(ApplyWatermarkJob::class)->count();

        $job = new RegenerateAgencyWatermarksJob($agency->id);
        $job->handle();

        // TCK-539 (mission 5) — plus de purge en bloc : `thumbnail`, réécrite en ligne, sort de
        // la trace ; `preview` attend son `PerformConversionsJob` et son fichier est encore
        // l'ancien, filigrané — il reste donc dans la trace, à juste titre.
        $this->assertEquals(['preview'], $media->fresh()->getCustomProperty('watermarked_conversions', []));

        $this->drainQueueWatermarksFirst();

        $this->assertEquals([], $media->fresh()->getCustomProperty('watermarked_conversions', []));
        $this->assertSame($jobsAvant, Queue::pushed(ApplyWatermarkJob::class)->count(), 'Filigrane désactivé : aucun job de plus.');
    }

    /**
     * De bout en bout, sur le disque distant : un logo ajouté se retrouve dans CHAQUE conversion.
     *
     * Rien n'est simulé hors du disque : `QUEUE_CONNECTION=sync`, donc les conversions en file,
     * le listener et `ApplyWatermarkJob` tournent pendant `handle()`.
     */
    public function test_changing_logo_then_running_job_uses_new_logo(): void
    {
        [, $agency, , $media] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);

        $before = $this->conversionBytes($media);

        $agency->addMedia(UploadedFile::fake()->image('logo.png', 240, 80))->toMediaCollection('logo');

        (new RegenerateAgencyWatermarksJob($agency->id))->handle();

        $after = $this->conversionBytes($media);

        foreach (Property::watermarkedConversions() as $conversion) {
            $this->assertNotSame($before[$conversion], $after[$conversion], "`{$conversion}` doit porter le nouveau logo.");
        }

        $this->assertEqualsCanonicalizing(
            Property::watermarkedConversions(),
            $media->fresh()->getCustomProperty('watermarked_conversions', []),
        );
    }

    /**
     * Réglages inchangés : la régénération rend EXACTEMENT les octets de l'upload. Chaque
     * conversion est donc réécrite depuis la source et filigranée une fois — ni nue, ni deux fois.
     */
    public function test_regenerating_with_unchanged_settings_watermarks_each_conversion_exactly_once(): void
    {
        [, $agency, , $media] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);

        $before = $this->conversionBytes($media);

        (new RegenerateAgencyWatermarksJob($agency->id))->handle();

        $this->assertSame($before, $this->conversionBytes($media));
    }

    /**
     * TCK-539 — le job ne dépose PLUS le filigrane lui-même : `preview` et `full` sont en file,
     * et un `ApplyWatermarkJob` déposé ici pouvait tourner avant leur `PerformConversionsJob` —
     * filigraner l'ancien fichier, le marquer, puis laisser nu celui que la conversion réécrit.
     * Le filigrane suit l'événement de fin de conversion, et lui seul : à ce stade, seule
     * `thumbnail` (synchrone) a été réécrite, donc seule elle a son job.
     */
    public function test_job_leaves_the_watermark_to_the_conversion_event(): void
    {
        [, $agency] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);

        Queue::fake()->except([RegeneratePhotoConversionsJob::class]);

        (new RegenerateAgencyWatermarksJob($agency->id))->handle();

        Queue::assertPushed(PerformConversionsJob::class);
        $this->assertSame(
            ['thumbnail'],
            Queue::pushed(ApplyWatermarkJob::class)->map(fn (ApplyWatermarkJob $job) => $job->conversionName)->values()->all(),
        );
    }

    /**
     * La même propriété, cette fois avec les conversions RÉELLEMENT en file, jouées dans
     * l'ordre le plus défavorable : à chaque tour, tout `ApplyWatermarkJob` en attente passe
     * AVANT les conversions. C'est l'ordre qui ouvrait la course quand la régénération
     * déposait elle-même le filigrane : l'ancien fichier filigrané deux fois et marqué, puis
     * la conversion réécrite nue et sautée. Chaque conversion publique doit sortir filigranée
     * exactement une fois, donc identique octet pour octet à celle de l'upload.
     */
    #[DataProvider('regenerations')]
    public function test_regeneration_with_queued_conversions_watermarks_each_conversion_exactly_once(string $voie): void
    {
        [, $agency, , $media] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);
        $before = $this->conversionBytes($media);

        Queue::fake()->except([RegeneratePhotoConversionsJob::class]);

        if ($voie === 'job') {
            (new RegenerateAgencyWatermarksJob($agency->id))->handle();
        } else {
            $this->artisan('media:regenerate-property-conversions')->assertSuccessful();
        }

        Queue::assertPushed(PerformConversionsJob::class);
        $this->drainQueueWatermarksFirst();

        $this->assertSame($before, $this->conversionBytes($media));
        $this->assertEqualsCanonicalizing(
            Property::watermarkedConversions(),
            $media->fresh()->getCustomProperty('watermarked_conversions', []),
        );
    }

    /** @return array<string, array{string}> */
    public static function regenerations(): array
    {
        return [
            'RegenerateAgencyWatermarksJob' => ['job'],
            'media:regenerate-property-conversions' => ['commande'],
        ];
    }

    /**
     * Exécute les jobs capturés par `Queue::fake()` jusqu'à épuisement — y compris ceux
     * qu'ils déposent (`CallQueuedListener` → `ApplyWatermarkJob`) — en faisant passer, à
     * chaque tour, les `ApplyWatermarkJob` avant tout le reste.
     */
    private function drainQueueWatermarksFirst(): void
    {
        $executes = [];

        // Une vraie file synchrone, hors de la façade : chaque job y est sérialisé puis
        // exécuté comme par un worker, et ce qu'il dépose retombe dans `Queue::fake()`.
        $worker = new SyncQueue;
        $worker->setContainer(app());
        $worker->setConnectionName('sync');

        for ($tour = 0; $tour < 10; $tour++) {
            $enAttente = collect(Queue::pushedJobs())
                ->flatten(1)
                ->pluck('job')
                ->reject(fn (object $job) => isset($executes[spl_object_id($job)]))
                ->sortBy(fn (object $job) => $job instanceof ApplyWatermarkJob ? 0 : 1)
                ->values();

            if ($enAttente->isEmpty()) {
                return;
            }

            foreach ($enAttente as $job) {
                $executes[spl_object_id($job)] = true;
                $worker->push($job);
            }
        }

        $this->fail('La file ne se vide pas en 10 tours.');
    }

    public function test_other_agency_photos_untouched(): void
    {
        Queue::fake()->except([RegeneratePhotoConversionsJob::class]);

        [, $agencyA, , $mediaA] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);
        [, $agencyB, , $mediaB] = $this->createAgencyWithPropertyAndMedia(['watermark_enabled' => true]);

        $mediaA->setCustomProperty('watermarked_conversions', ['thumbnail']);
        $mediaA->save();

        $job = new RegenerateAgencyWatermarksJob($agencyB->id);
        $job->handle();

        $mediaA->refresh();
        $this->assertEquals(['thumbnail'], $mediaA->getCustomProperty('watermarked_conversions', []),
            'Media from agency A must not be touched when regenerating agency B');
    }
}
