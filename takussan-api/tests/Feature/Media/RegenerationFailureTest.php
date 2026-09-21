<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Jobs\Media\RegeneratePhotoConversionsJob;
use App\Listeners\Media\FailClosedWhenConversionsJobFails;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\WatermarkTrace;
use Error;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Queue\CallQueuedHandler;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Jobs\SyncJob;
use Illuminate\Queue\MaxAttemptsExceededException;
use Illuminate\Queue\SyncQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Spatie\MediaLibrary\Conversions\ConversionCollection;
use Spatie\MediaLibrary\Conversions\FileManipulator;
use Spatie\MediaLibrary\Conversions\Jobs\PerformConversionsJob;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;
use Throwable;

/**
 * TCK-539 — R1a de la quatrième passe adverse : une régénération qui ÉCHOUE réellement (source
 * illisible sur `r2-private`) se terminait en SUCCÈS. `media-library:regenerate` avale
 * l'exception média par média et rend 0 : `failed()` n'était jamais atteint, l'exemption
 * survivait, et la photo d'une agence qui exige le filigrane restait servie NUE, sans journal.
 *
 * Rien n'appelle `failed()` sur une instance déjà en main : c'est la FILE qui doit l'atteindre,
 * ou `CallQueuedHandler::failed()` sur une instance désérialisée, comme le fait le worker quand le
 * délai de la dernière tentative expire (V5-1, cinquième passe adverse).
 */
class RegenerationFailureTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $public;

    private FilesystemAdapter $private;

    /** @var list<string> */
    private array $jobsEchoues = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->public = RemoteDiskFake::install('r2-media');
        $this->private = RemoteDiskFake::install('r2-private');

        Queue::failing(fn (JobFailed $event) => $this->jobsEchoues[] = $event->job->resolveName());
    }

    private function agenceSansFiligrane(): Agency
    {
        return Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => false],
        ]);
    }

    /** @return array{Property, Media} photo produite sans filigrane : exemptée, nue */
    private function photo(Agency $agency, string $nom = 'villa'): array
    {
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $media = $property->addMedia(UploadedFile::fake()->image("{$nom}.jpg", 2000, 1500))
            ->toMediaCollection('photos')
            ->refresh();

        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []), 'Précondition : exemptée.');

        return [$property, $media];
    }

    private function perdreLaSource(Media $media): void
    {
        $this->private->delete($media->getPathRelativeToRoot());
        $this->assertFalse($this->private->exists($media->getPathRelativeToRoot()), 'Précondition : source absente.');
    }

    private function detail(Property $property): array
    {
        return $this->getJson('/api/public/properties/'.$property->slug)->assertOk()->json('data');
    }

    /**
     * Rejoue, par une vraie file synchrone, chaque job capturé. Comme un worker : l'échec de l'un
     * n'empêche pas le suivant, et `failed()` est atteint par la file, pas par un appel direct.
     *
     * @param  iterable<object>  $jobs
     */
    private function jouer(iterable $jobs): void
    {
        $worker = new SyncQueue;
        $worker->setContainer(app());
        $worker->setConnectionName('sync');

        foreach ($jobs as $job) {
            try {
                $worker->push($job);
            } catch (Throwable) {
                // attendu pour la photo dont la source est perdue
            }
        }
    }

    /**
     * Ce que fait le worker quand le délai de la DERNIÈRE tentative expire : il appelle `failed()`
     * sur une instance désérialisée, sans que `handle()` ait tourné ni fini
     * (`Worker::registerTimeoutHandler()` → `markJobAsFailedIfWillExceedMaxAttempts()`).
     */
    private function expirer(object $job): void
    {
        app(CallQueuedHandler::class)->failed(
            ['command' => serialize($job)],
            new MaxAttemptsExceededException($job::class.' has been attempted too many times.'),
            'uuid-expiration',
        );
    }

    /** Activation par écriture de masse : ni observateur, ni régénération. La photo reste exemptée, donc NUE et servie. */
    private function activerSansRegenerer(Agency $agency): void
    {
        Agency::query()->whereKey($agency->id)->update(['settings' => json_encode(['watermark_enabled' => true])]);
    }

    /**
     * Le scénario du vérificateur (passe 4), plus un second bien sain : source supprimée sur
     * `r2-private`, filigrane activé. Depuis V5-1, le job d'agence ne fait que répartir : c'est le
     * job de la photo perdue qui échoue, par la file, et celui de la photo saine qui passe.
     */
    public function test_a_real_regeneration_failure_reaches_failed_through_the_queue_and_serves_nothing_naked(): void
    {
        $agency = $this->agenceSansFiligrane();
        [$perdu, $mediaPerdu] = $this->photo($agency, 'perdue');
        [$sain, $mediaSain] = $this->photo($agency, 'saine');
        $this->perdreLaSource($mediaPerdu);

        Queue::fake([RegeneratePhotoConversionsJob::class]);
        $agency->update(['settings' => ['watermark_enabled' => true]]);

        $this->assertEqualsCanonicalizing(
            [$mediaPerdu->id, $mediaSain->id],
            Queue::pushed(RegeneratePhotoConversionsJob::class)->map(fn (RegeneratePhotoConversionsJob $job) => $job->mediaId)->all(),
            'L\'activation met en file un job par photo.',
        );

        Log::spy();
        $this->jouer(Queue::pushed(RegeneratePhotoConversionsJob::class));

        // 1. `failed()` atteint PAR LA FILE, pour la photo perdue seulement.
        $this->assertSame([RegeneratePhotoConversionsJob::class], $this->jobsEchoues);

        // 2. Le journal du média en échec : media_id, property_id, agency_id.
        Log::shouldHaveReceived('error')->withArgs(fn (string $message, array $context = []) => str_contains($message, '[RegeneratePhotoConversionsJob]')
            && ($context['media_id'] ?? null) === $mediaPerdu->id
            && ($context['property_id'] ?? null) === $perdu->id
            && ($context['agency_id'] ?? null) === $agency->id);

        // 3. Rien de nu servi : exemptions retirées, photo cachée.
        $this->assertSame([], $mediaPerdu->fresh()->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $detail = $this->detail($perdu);
        $this->assertSame([], $detail['photos']);
        $this->assertNull($detail['main_photo_url']);

        // 4. Le média sain, traité APRÈS l'échec, est filigrané et servi.
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $mediaSain->fresh()->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertCount(1, $this->detail($sain)['photos']);
    }

    /**
     * V5-1, cinquième passe adverse (`test_f` du vérificateur) : le délai de la dernière tentative
     * expire, et le worker appelle `failed()` sans que `handle()` ait retiré quoi que ce soit.
     * La photo était servie NUE au titre de son exemption ; elle ne doit plus l'être, le journal
     * doit le dire, et `--untraced` doit la rattraper ensuite.
     */
    public function test_an_agency_job_that_times_out_fails_closed_without_handle_having_run(): void
    {
        $agency = $this->agenceSansFiligrane();
        [$property, $media] = $this->photo($agency);
        // Un second bien de la même agence : le retrait couvre TOUTES ses photos (V6-1).
        [$autreBien, $autreMedia] = $this->photo($agency, 'autre');
        $this->activerSansRegenerer($agency);
        foreach ([$property, $autreBien] as $bien) {
            $this->assertNotNull($this->detail($bien)['main_photo_url'], 'Précondition : servie nue au titre de l\'exemption.');
        }

        Log::spy();
        $this->expirer(new RegenerateAgencyWatermarksJob($agency->id));

        foreach ([[$property, $media], [$autreBien, $autreMedia]] as [$bien, $photo]) {
            $this->assertSame([], $photo->fresh()->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []), "media {$photo->id}");
            $detail = $this->detail($bien);
            $this->assertSame([], $detail['photos'], "bien {$bien->id}");
            $this->assertNull($detail['main_photo_url'], "bien {$bien->id}");
        }
        Log::shouldHaveReceived('error')->withArgs(fn (string $message, array $context = []) => str_contains($message, '[RegenerateAgencyWatermarksJob] Régénération abandonnée')
            && str_contains($message, 'Exemptions retirées')
            && ($context['agency_id'] ?? null) === $agency->id
            && ($context['exemptions_withdrawn'] ?? null) === 2
            && str_contains((string) ($context['exception'] ?? ''), 'attempted too many times'));

        // `--untraced` rattrape la photo une fois la cause levée : filigranée, et servie.
        $this->artisan('media:regenerate-property-conversions', ['--agency' => $agency->id, '--untraced' => true])->assertSuccessful();
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->fresh()->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertCount(1, $this->detail($property)['photos']);
    }

    /** V6-2 : une agence qui n'exige PAS le filigrane ne perd rien — ses photos exemptées restent servies. */
    public function test_an_agency_job_that_times_out_withdraws_nothing_when_the_watermark_is_not_required(): void
    {
        $agency = $this->agenceSansFiligrane();
        [$property, $media] = $this->photo($agency);

        Log::spy();
        $this->expirer(new RegenerateAgencyWatermarksJob($agency->id));

        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->fresh()->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertNotNull($this->detail($property)['main_photo_url']);
        Log::shouldHaveReceived('error')->withArgs(fn (string $message, array $context = []) => str_contains($message, 'Filigrane non exigé')
            && ($context['agency_id'] ?? null) === $agency->id
            && ($context['watermark_required'] ?? null) === false
            && ($context['exemptions_withdrawn'] ?? null) === 0);
    }

    /** Même chose pour le job d'UNE photo : son `failed()` ne suppose pas que `handle()` a tourné. */
    public function test_a_photo_job_that_times_out_fails_closed_without_handle_having_run(): void
    {
        $agency = $this->agenceSansFiligrane();
        [$property, $media] = $this->photo($agency);
        $this->activerSansRegenerer($agency);
        $this->assertNotNull($this->detail($property)['main_photo_url'], 'Précondition : servie nue au titre de l\'exemption.');

        Log::spy();
        $this->expirer(new RegeneratePhotoConversionsJob($media->id));

        $this->assertSame([], $media->fresh()->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertNull($this->detail($property)['main_photo_url']);
        Log::shouldHaveReceived('error')->withArgs(fn (string $message, array $context = []) => str_contains($message, '[RegeneratePhotoConversionsJob]')
            && str_contains($message, 'exemptions retirées')
            && ($context['media_id'] ?? null) === $media->id
            && ($context['property_id'] ?? null) === $property->id
            && ($context['agency_id'] ?? null) === $agency->id);
    }

    /**
     * K3b de la cinquième passe : le fail-closed retire les EXEMPTIONS, jamais les conversions
     * filigranées — leur fichier porte le filigrane. Une photo déjà filigranée dont la
     * régénération suivante échoue (changement de logo, source momentanément illisible) reste
     * servie, et filigranée.
     */
    public function test_a_failure_does_not_withdraw_an_already_watermarked_conversion(): void
    {
        $agency = Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => true],
        ]);
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $media = $property->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))->toMediaCollection('photos')->refresh();
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::KEY, []), 'Précondition : filigranée.');

        $this->expirer(new RegeneratePhotoConversionsJob($media->id));
        $this->expirer(new RegenerateAgencyWatermarksJob($agency->id));

        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->fresh()->getCustomProperty(WatermarkTrace::KEY, []));
        $photos = $this->detail($property)['photos'];
        $this->assertCount(1, $photos);
        $this->assertStringContainsString('-full.', $photos[0]['full']);
    }

    /**
     * Le cas mixte, où le retrait a lieu : `thumbnail` déjà régénérée et filigranée, `preview` et
     * `full` encore exemptées. L'échec retire les deux exemptions, et `thumbnail` reste dans la
     * trace : la photo reste à l'écran par le repli, filigranée.
     */
    public function test_a_failure_withdraws_exemptions_but_keeps_the_watermarked_conversion(): void
    {
        $agency = $this->agenceSansFiligrane();
        [$property, $media] = $this->photo($agency);

        Queue::fake([PerformConversionsJob::class]);
        $agency->update(['settings' => ['watermark_enabled' => true]]);
        $media->refresh();
        $this->assertSame(['thumbnail'], $media->getCustomProperty(WatermarkTrace::KEY, []), 'Précondition : thumbnail filigranée.');
        $this->assertEqualsCanonicalizing(['preview', 'full'], $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []), 'Précondition : preview/full exemptées.');

        $this->expirer(new RegeneratePhotoConversionsJob($media->id));

        $media->refresh();
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertSame(['thumbnail'], $media->getCustomProperty(WatermarkTrace::KEY, []));
        $photos = $this->detail($property)['photos'];
        $this->assertCount(1, $photos);
        $this->assertStringContainsString('-thumbnail.', $photos[0]['full']);
    }

    /**
     * K4 de la cinquième passe : une `Error` (et non une `Exception`) levée par la conversion
     * retire les exemptions DÈS cette tentative, avant tout rejeu, puis remonte à la file.
     */
    public function test_an_error_thrown_by_the_conversion_withdraws_exemptions_before_any_retry(): void
    {
        $agency = $this->agenceSansFiligrane();
        [$property, $media] = $this->photo($agency);
        $this->activerSansRegenerer($agency);

        $this->mock(FileManipulator::class, fn ($mock) => $mock->shouldReceive('createDerivedFiles')->andThrow(new Error('GD a planté')));

        try {
            (new RegeneratePhotoConversionsJob($media->id))->handle();
            $this->fail('L\'erreur doit remonter à la file, pour qu\'elle rejoue.');
        } catch (Error $error) {
            $this->assertSame('GD a planté', $error->getMessage());
        }

        $this->assertSame([], $media->fresh()->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertNull($this->detail($property)['main_photo_url']);
    }

    public function test_the_regeneration_command_exits_non_zero_when_a_media_fails(): void
    {
        $agency = $this->agenceSansFiligrane();
        [$property, $media] = $this->photo($agency);
        $this->perdreLaSource($media);
        // Activation sans l'observateur (écriture de masse) : c'est la commande qui rattrape.
        Agency::query()->whereKey($agency->id)->update(['settings' => json_encode(['watermark_enabled' => true])]);

        Log::spy();

        $this->artisan('media:regenerate-property-conversions', ['--agency' => $agency->id])
            ->expectsOutputToContain("Media {$media->id} (bien {$property->id}) non régénéré")
            ->assertFailed();

        Log::shouldHaveReceived('error')->withArgs(fn (string $message, array $context = []) => ($context['media_id'] ?? null) === $media->id
            && ($context['agency_id'] ?? null) === $agency->id);
        $this->assertSame([], $media->fresh()->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertNull($this->detail($property)['main_photo_url']);
    }

    public function test_the_untraced_repair_exits_non_zero_when_a_media_fails(): void
    {
        $agency = $this->agenceSansFiligrane();
        [, $media] = $this->photo($agency);
        $media->setCustomProperty(WatermarkTrace::EXEMPT_KEY, [])->save();
        $this->perdreLaSource($media);

        $this->artisan('media:regenerate-property-conversions', ['--untraced' => true])->assertFailed();
    }

    /**
     * Le versant ASYNCHRONE : `thumbnail` réussit en ligne, puis le `PerformConversionsJob` de
     * `preview`/`full` échoue en file. Il n'atteint jamais `ConversionWillStartEvent` : sans
     * `FailClosedWhenConversionsJobFails`, leurs exemptions survivaient, et `full` restait nue.
     */
    public function test_a_failed_queued_conversion_job_withdraws_its_exemptions(): void
    {
        $agency = $this->agenceSansFiligrane();
        [$property, $media] = $this->photo($agency);

        Queue::fake([PerformConversionsJob::class]);
        $agency->update(['settings' => ['watermark_enabled' => true]]);

        $media->refresh();
        $this->assertContains('thumbnail', $media->getCustomProperty(WatermarkTrace::KEY, []), 'Précondition : thumbnail régénérée et filigranée.');
        $this->assertEqualsCanonicalizing(['preview', 'full'], $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []), 'Précondition : preview/full encore exemptées.');

        $this->perdreLaSource($media);
        Log::spy();

        $worker = new SyncQueue;
        $worker->setContainer(app());
        $worker->setConnectionName('sync');
        foreach (Queue::pushed(PerformConversionsJob::class) as $job) {
            try {
                $worker->push($job);
            } catch (Throwable) {
                // attendu : la source est perdue
            }
        }

        $this->assertContains(PerformConversionsJob::class, $this->jobsEchoues);
        $this->assertSame([], $media->fresh()->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        Log::shouldHaveReceived('error')->withArgs(fn (string $message, array $context = []) => str_contains($message, '[PerformConversionsJob]')
            && ($context['media_id'] ?? null) === $media->id
            && ($context['conversions'] ?? null) === ['preview', 'full']);

        // La photo reste à l'écran, par le repli sur `thumbnail` — filigranée.
        $photos = $this->detail($property)['photos'];
        $this->assertCount(1, $photos);
        $this->assertStringContainsString('-thumbnail.', $photos[0]['full']);
    }

    /**
     * K6 de la cinquième passe : le média est supprimé avant que l'échec du
     * `PerformConversionsJob` soit traité. Désérialiser la charge utile lève alors une
     * `ModelNotFoundException` (une `RuntimeException`) : le listener ne doit pas la laisser sortir,
     * sans quoi il ferait échouer le traitement de l'échec lui-même.
     */
    public function test_the_conversion_failure_listener_ignores_a_media_deleted_before_the_event(): void
    {
        $agency = $this->agenceSansFiligrane();
        [, $media] = $this->photo($agency);

        $command = new PerformConversionsJob(ConversionCollection::createForMedia($media), $media);
        $job = new SyncJob(app(), json_encode(['data' => [
            'commandName' => PerformConversionsJob::class,
            'command' => serialize($command),
        ]]), 'sync', 'media');

        Media::query()->whereKey($media->id)->delete();

        app(FailClosedWhenConversionsJobFails::class)->handle(new JobFailed('sync', $job, new RuntimeException('source perdue')));

        $this->assertNull(Media::query()->find($media->id));
    }
}
