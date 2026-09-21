<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Jobs\Media\RegeneratePhotoConversionsJob;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\WatermarkService;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Queue\SyncQueue;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Spatie\MediaLibrary\Conversions\Events\ConversionWillStartEvent;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-539 (mission 5) — la trace `watermarked_conversions` suit les écritures conversion par
 * conversion, au lieu d'être purgée en bloc avant une régénération.
 *
 * L'invariant éprouvé partout ici : **une conversion présente dans la trace a, sur le disque
 * public, les octets filigranés**. Il s'appuie sur une mesure (notes de TCK-539) : à réglages
 * inchangés, GD rend exactement les mêmes octets, donc « filigrané » = « identique à la
 * conversion filigranée de l'upload ».
 */
class WatermarkTraceDuringRegenerationTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $public;

    protected function setUp(): void
    {
        parent::setUp();

        $this->public = RemoteDiskFake::install('r2-media');
        RemoteDiskFake::install('r2-private');
    }

    /** @return array{Agency, list<Property>, list<Media>} biens filigranés, photos déjà filigranées (file synchrone) */
    private function agenceAvecPhotos(int $biens): array
    {
        $agency = Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => true],
        ]);

        $properties = [];
        $medias = [];
        for ($i = 0; $i < $biens; $i++) {
            $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
            $properties[] = $property;
            $medias[] = $property->addMedia(UploadedFile::fake()->image("villa-{$i}.jpg", 2000, 1500))
                ->toMediaCollection('photos')
                ->refresh();
        }

        foreach ($medias as $media) {
            $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty('watermarked_conversions', []), 'Précondition : photo filigranée.');
        }

        return [$agency, $properties, $medias];
    }

    /** @return array<int, array<string, string>> [media id][conversion] => octets publics */
    private function octets(array $medias): array
    {
        $octets = [];
        foreach ($medias as $media) {
            foreach (Property::watermarkedConversions() as $conversion) {
                $octets[$media->id][$conversion] = $this->public->get($media->getPathRelativeToRoot($conversion));
            }
        }

        return $octets;
    }

    /** L'invariant, relu EN BASE (pas sur une instance) : tracé ⇒ octets filigranés. */
    private function assertTraceDitVrai(array $filigranes, string $quand): void
    {
        foreach ($filigranes as $id => $parConversion) {
            $media = Media::query()->find($id);
            foreach ($media->getCustomProperty('watermarked_conversions', []) as $conversion) {
                $this->assertSame(
                    $parConversion[$conversion],
                    $this->public->get($media->getPathRelativeToRoot($conversion)),
                    "{$quand} : media {$id}, `{$conversion}` est dans la trace mais son fichier public n'est pas le filigrané.",
                );
            }
        }
    }

    /**
     * Vide les jobs capturés comme un worker, un par un, en contrôlant l'invariant après
     * chacun. `$filigranesDabord` : l'ordre le plus défavorable, `ApplyWatermarkJob` en tête.
     */
    private function drainer(array $filigranes, bool $filigranesDabord): void
    {
        $executes = [];
        $worker = new SyncQueue;
        $worker->setContainer(app());
        $worker->setConnectionName('sync');

        for ($tour = 0; $tour < 20; $tour++) {
            $enAttente = collect(Queue::pushedJobs())->flatten(1)->pluck('job')
                ->reject(fn (object $job) => isset($executes[spl_object_id($job)]))
                ->when($filigranesDabord, fn ($jobs) => $jobs->sortBy(fn (object $job) => $job instanceof ApplyWatermarkJob ? 0 : 1))
                ->values();

            if ($enAttente->isEmpty()) {
                return;
            }

            foreach ($enAttente as $job) {
                $executes[spl_object_id($job)] = true;
                $worker->push($job);
                $this->assertTraceDitVrai($filigranes, 'après '.class_basename($job));
            }
        }

        $this->fail('La file ne se vide pas en 20 tours.');
    }

    public function test_photos_not_yet_rewritten_stay_served_with_their_watermarked_url_during_regeneration(): void
    {
        [$agency, $properties, $medias] = $this->agenceAvecPhotos(2);
        $filigranes = $this->octets($medias);

        // Le job d'agence ne fait que répartir (V5-1) : le job de chaque photo tourne ici, en ligne.
        Queue::fake()->except([RegeneratePhotoConversionsJob::class]);

        (new RegenerateAgencyWatermarksJob($agency->id))->handle();

        // La régénération est EN COURS : `thumbnail` réécrite (nue), `preview`/`full` en file.
        foreach ($properties as $i => $property) {
            $photos = $this->getJson('/api/public/properties/'.$property->slug)->assertOk()->json('data.photos');

            $this->assertCount(1, $photos, 'La photo ne doit pas disparaître de la fiche pendant la régénération.');
            $this->assertNotNull($photos[0]['full']);
            $this->assertStringContainsString('/conversions/', $photos[0]['full']);
            $this->assertStringContainsString('-full.', $photos[0]['full']);
            $this->assertSame(
                $filigranes[$medias[$i]->id]['full'],
                $this->public->get($medias[$i]->getPathRelativeToRoot('full')),
                'L\'URL servie mène au fichier filigrané, pas encore réécrit.',
            );
            $this->assertNull($photos[0]['thumbnail'], '`thumbnail`, réécrite nue, est cachée jusqu\'à son filigrane.');
        }

        $this->assertTraceDitVrai($filigranes, 'régénération lancée');

        foreach ([false, true] as $filigranesDabord) {
            $this->drainer($filigranes, $filigranesDabord);
        }

        foreach ($medias as $media) {
            $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->fresh()->getCustomProperty('watermarked_conversions', []));
        }
        $this->assertSame($filigranes, $this->octets($medias), 'Chaque conversion ressort filigranée exactement une fois.');
    }

    /**
     * L'instant qui compte est JUSTE APRÈS l'écriture du fichier nu, avant
     * `ConversionHasBeenCompletedEvent` : c'est là qu'un retrait fait « après coup » laisserait
     * la trace mentir. On l'observe à chaque sauvegarde du média, dont celle de
     * `markAsConversionGenerated()`, qui suit immédiatement `copyToMediaLibrary()` dans
     * `PerformConversionAction`.
     */
    public function test_a_conversion_leaves_the_trace_before_its_file_is_rewritten(): void
    {
        [$agency, , $medias] = $this->agenceAvecPhotos(1);
        $filigranes = $this->octets($medias);
        $controles = 0;

        Media::saving(function (Media $media) use ($filigranes, &$controles) {
            // Toute sauvegarde du média : le marquage (`saveOrTouch()` — un simple `touch()` en
            // régénération, `generated_conversions` étant déjà vrai), le retrait, le filigrane.
            if (isset($filigranes[$media->id])) {
                $controles++;
                $this->assertTraceDitVrai($filigranes, 'au marquage de la conversion');
            }
        });

        Queue::fake()->except([RegeneratePhotoConversionsJob::class]);
        (new RegenerateAgencyWatermarksJob($agency->id))->handle();
        $this->drainer($filigranes, true);

        $this->assertGreaterThanOrEqual(3, $controles, 'Précondition : chaque conversion a été contrôlée à son écriture.');
        $this->assertSame($filigranes, $this->octets($medias));
    }

    /**
     * Un `ApplyWatermarkJob` PÉRIMÉ passe entre le début de la conversion et son écriture (ce
     * qu'un second processus permet) : il remet la conversion dans la trace, puis la conversion
     * réécrit un fichier nu. Le second retrait, à la fin de la conversion, doit la rendre au
     * job de CETTE génération — sinon elle reste nue pour de bon, marquée « faite ».
     */
    public function test_a_stale_watermark_job_between_start_and_write_does_not_leave_the_conversion_naked(): void
    {
        [$agency, , $medias] = $this->agenceAvecPhotos(1);
        $filigranes = $this->octets($medias);
        $mediaId = $medias[0]->id;
        $joue = false;

        Event::listen(ConversionWillStartEvent::class, function (ConversionWillStartEvent $event) use ($mediaId, &$joue) {
            if (! $joue && $event->media->id === $mediaId && $event->conversion->getName() === 'full') {
                $joue = true;
                (new ApplyWatermarkJob($mediaId, 'full'))->handle(new WatermarkService);
            }
        });

        Queue::fake()->except([RegeneratePhotoConversionsJob::class]);
        (new RegenerateAgencyWatermarksJob($agency->id))->handle();
        $this->drainer([], false);

        $this->assertTrue($joue, 'Précondition : le job périmé a bien été intercalé.');
        $this->assertContains('full', Media::query()->find($mediaId)->getCustomProperty('watermarked_conversions', []));
        $this->assertSame($filigranes[$mediaId]['full'], $this->public->get($medias[0]->getPathRelativeToRoot('full')), '`full` doit finir filigranée une fois.');
    }
}
