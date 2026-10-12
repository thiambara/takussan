<?php

namespace Tests\Feature\Media;

use App\Domain\Features\Flag;
use App\Jobs\Media\ApplyWatermarkJob;
use App\Jobs\Media\RegeneratePhotoConversionsJob;
use App\Models\Agency;
use App\Models\FeatureFlag;
use App\Models\Property;
use App\Models\User;
use App\Services\Features\FeatureFlagEvaluator;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Media\WatermarkService;
use App\Services\Media\WatermarkTrace;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-633 (lot A, AC7) — le filigrane est d'abord un choix de PLATEFORME : `media_watermark`,
 * ÉTEINT tant qu'aucune ligne ne l'allume. Éteint : aucune pose, et une photo dont le filigrane
 * n'est plus attendu est servie. Allumé : la règle d'avant, réglage d'agence compris.
 *
 * La règle se lit par DEUX chemins, et chacun a son cas ici : `AgencyWatermarkContext::isEnabledFor()`
 * (un bien dont l'agence est chargée — la fiche publique) et `WatermarkRequirement` (un lot, et tout
 * bien sans agence chargée — la liste publique, l'écouteur de conversion, `ApplyWatermarkJob`).
 */
class WatermarkGlobalFlagTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $public;

    protected function setUp(): void
    {
        parent::setUp();

        $this->public = RemoteDiskFake::install('r2-media');
        RemoteDiskFake::install('r2-private');
    }

    /**
     * Pose le drapeau en base, puis oublie la valeur retenue pour le cycle en cours : la lecture
     * suivante est celle d'une nouvelle requête ou d'un nouveau job.
     */
    private function drapeau(bool $allume): void
    {
        FeatureFlag::query()->updateOrCreate(
            ['key' => Flag::MediaWatermark->value],
            ['label' => Flag::MediaWatermark->value, 'enabled' => $allume, 'segments_json' => []],
        );
        app()->forgetScopedInstances();
    }

    private function agence(bool $filigrane): Agency
    {
        return Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => $filigrane],
        ]);
    }

    /** @return array{Property, Media} */
    private function photo(Agency $agency): array
    {
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $media = $property->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))
            ->toMediaCollection('photos')
            ->refresh();

        return [$property, $media];
    }

    /** La fiche publique : son bien charge `agency` — chemin `isEnabledFor()`. */
    private function photosPubliques(Property $property): array
    {
        return $this->getJson('/api/public/properties/'.$property->slug)->assertOk()->json('data.photos');
    }

    /** La liste publique : elle ne charge pas `agency` — chemin `WatermarkRequirement`. */
    private function photoPrincipaleDeLaListe(): ?string
    {
        return $this->getJson('/api/public/properties')->assertOk()->json('data.0.main_photo_url');
    }

    // ── 1. Le drapeau ────────────────────────────────────────────────────────────────────

    public function test_the_flag_is_catalogued_off_by_default_and_never_served_to_the_client(): void
    {
        $this->assertSame(Flag::MediaWatermark, Flag::tryFrom('media_watermark'));
        $this->assertFalse(
            app(FeatureFlagEvaluator::class)->isEnabled(Flag::MediaWatermark->value),
            'Absent de la base : éteint.',
        );

        $this->actingAsRole('agency_admin');
        $this->drapeau(true);

        $this->assertArrayNotHasKey(
            Flag::MediaWatermark->value,
            $this->getJson('/api/feature-flags/me')->assertOk()->json('data') ?? [],
            'Décision serveur : le front n’a rien à en lire.',
        );
    }

    // ── 2. Le chemin `isEnabledFor()` ─────────────────────────────────────────────────────

    public function test_off_no_agency_requires_a_watermark_even_when_its_setting_asks_for_one(): void
    {
        $sous = $this->agence(true);

        $this->assertFalse(AgencyWatermarkContext::isEnabledFor($sous), 'Éteint : le réglage d’agence ne suffit pas.');

        $this->drapeau(true);
        $this->assertTrue(AgencyWatermarkContext::isEnabledFor($sous), 'Allumé : le réglage de l’agence reprend la main.');
        $this->assertFalse(AgencyWatermarkContext::isEnabledFor($this->agence(false)));
        $this->assertFalse(AgencyWatermarkContext::isEnabledFor(null), 'Sans agence : jamais.');
    }

    public function test_the_global_switch_is_read_once_per_cycle_then_reread_by_the_next(): void
    {
        $this->drapeau(true);
        $agences = collect(range(1, 5))->map(fn () => $this->agence(true));

        DB::flushQueryLog();
        DB::enableQueryLog();
        $agences->each(fn (Agency $agency) => $this->assertTrue(AgencyWatermarkContext::isEnabledFor($agency)));
        $lectures = collect(DB::getQueryLog())->filter(fn (array $q) => str_contains($q['query'], '"feature_flags"'))->count();
        DB::disableQueryLog();

        $this->assertSame(1, $lectures, "Le drapeau est lu {$lectures} fois pour 5 agences dans le même cycle.");

        $this->drapeau(false); // un nouveau cycle : requête suivante, job suivant
        $this->assertFalse(AgencyWatermarkContext::isEnabledFor($agences->first()));
    }

    // ── 3. Le chemin `WatermarkRequirement` : écouteur, job, liste ─────────────────────────

    /** AC7 — éteint, même pour une agence qui demande le filigrane : aucune pose, photo servie. */
    public function test_off_an_upload_is_not_watermarked_and_is_served(): void
    {
        Queue::fake([ApplyWatermarkJob::class]);
        [$property, $media] = $this->photo($this->agence(true));

        Queue::assertNotPushed(ApplyWatermarkJob::class);
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));

        $photos = $this->photosPubliques($property);
        $this->assertCount(1, $photos);
        $this->assertStringContainsString('-full.', $photos[0]['full']);
        $this->assertNotNull($this->photoPrincipaleDeLaListe());
    }

    /** `PublicPhotoUrl::isServable()` — une photo qui attendait son filigrane est servie dès qu'il n'est plus attendu. */
    public function test_turning_the_flag_off_serves_a_photo_still_awaiting_its_watermark(): void
    {
        $this->drapeau(true);
        Queue::fake([ApplyWatermarkJob::class]);
        [$property] = $this->photo($this->agence(true));
        $this->assertSame([], $this->photosPubliques($property), 'Précondition : allumé, la photo attend son filigrane.');
        $this->assertNull($this->photoPrincipaleDeLaListe(), 'Précondition : la liste la cache aussi.');

        $this->drapeau(false);

        $this->assertCount(1, $this->photosPubliques($property), 'Fiche (`isEnabledFor`) : servie.');
        $this->assertNotNull($this->photoPrincipaleDeLaListe(), 'Liste (`WatermarkRequirement`) : servie.');
    }

    public function test_a_watermark_job_queued_before_the_flag_went_off_applies_nothing(): void
    {
        $this->drapeau(true);
        Queue::fake([ApplyWatermarkJob::class]);
        [, $media] = $this->photo($this->agence(true));
        $nue = $this->public->get($media->getPathRelativeToRoot('full'));

        $this->drapeau(false);
        Queue::pushed(ApplyWatermarkJob::class)->each(fn (ApplyWatermarkJob $job) => $job->handle(new WatermarkService));

        $media->refresh();
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertSame($nue, $this->public->get($media->getPathRelativeToRoot('full')), '`full` reste nue.');
    }

    /** Allumé : le comportement d'avant, réglage d'agence compris. */
    public function test_on_the_agency_setting_decides_as_before(): void
    {
        $this->drapeau(true);
        Queue::fake([ApplyWatermarkJob::class]);

        [$sous] = $this->photo($this->agence(true));
        $this->assertEqualsCanonicalizing(
            Property::watermarkedConversions(),
            Queue::pushed(ApplyWatermarkJob::class)->map(fn (ApplyWatermarkJob $job) => $job->conversionName)->values()->all(),
        );
        $this->assertSame([], $this->photosPubliques($sous), 'Un envoi neuf sous filigrane attend son filigrane (fail-closed).');

        [$sans, $media] = $this->photo($this->agence(false));
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertCount(1, $this->photosPubliques($sans));
    }

    // ── 4. La commande de rattrapage ──────────────────────────────────────────────────────

    /** @return array{Property, Media, string} une photo filigranée par la chaîne réelle, et les octets de sa `full` */
    private function photoFiligranee(): array
    {
        $this->drapeau(true);
        [$property, $media] = $this->photo($this->agence(true));
        $media->refresh();
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::KEY, []), 'Précondition : filigranée.');

        return [$property, $media, $this->public->get($media->getPathRelativeToRoot('full'))];
    }

    public function test_the_command_refuses_to_run_while_the_flag_is_on(): void
    {
        $this->photoFiligranee();
        Queue::fake([RegeneratePhotoConversionsJob::class]);

        $this->artisan('media:regenerate-without-watermark')
            ->expectsOutputToContain('`media_watermark` est allumé')
            ->assertFailed();

        Queue::assertNotPushed(RegeneratePhotoConversionsJob::class);
    }

    public function test_the_command_counts_then_strips_the_watermark_and_is_idempotent(): void
    {
        [$property, $media, $filigranee] = $this->photoFiligranee();
        $this->photo($this->agence(false)); // exemptée : pas dans la sélection
        $this->drapeau(false);

        $this->artisan('media:regenerate-without-watermark', ['--dry-run' => true])
            ->expectsOutputToContain('1 photo(s) filigranée(s) à régénérer sans filigrane')
            ->assertSuccessful();

        $this->artisan('media:regenerate-without-watermark', ['--chunk' => 1])
            ->expectsOutputToContain('1 photo(s) mises en file `media`')
            ->assertSuccessful();

        $media->refresh();
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertNotSame($filigranee, $this->public->get($media->getPathRelativeToRoot('full')), '`full` est réécrite, nue.');
        $this->assertCount(1, $this->photosPubliques($property));

        $this->artisan('media:regenerate-without-watermark')
            ->expectsOutputToContain('0 photo(s) mises en file')
            ->assertSuccessful();
    }

    /**
     * « Par lots » se MESURE : on compte les lectures de la sélection (la clause sur la trace) dans
     * le journal des requêtes. `lazyById($n)` lit `ceil(photos / n)` pages, plus une page vide
     * quand la dernière est pleine ; un `get()` lirait tout d'un coup, `--chunk` ignoré. Le message
     * de la commande répète l'option et ne prouve rien : ce test ne le lit pas.
     */
    public function test_the_command_reads_the_selection_in_chunks_of_the_given_size(): void
    {
        $photos = collect(range(1, 3))->map(fn () => $this->photoFiligranee()[1]);
        $this->drapeau(false);
        Queue::fake([RegeneratePhotoConversionsJob::class]);

        $lecturesDeLaSelection = function (int $chunk): array {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->artisan('media:regenerate-without-watermark', ['--chunk' => $chunk])->assertSuccessful();
            $lectures = collect(DB::getQueryLog())
                ->pluck('query')
                ->filter(fn (string $q) => str_contains($q, 'from "media"') && str_contains($q, WatermarkTrace::KEY))
                ->values()
                ->all();
            DB::disableQueryLog();

            return $lectures;
        };

        $parUn = $lecturesDeLaSelection(1);
        $this->assertCount(4, $parUn, "3 photos par lots de 1 : 3 pages pleines + 1 vide.\n".implode("\n", $parUn));
        foreach ($parUn as $lecture) {
            $this->assertMatchesRegularExpression('/\blimit 1\b/', $lecture, 'Chaque lecture est bornée par --chunk.');
        }

        $parDeux = $lecturesDeLaSelection(2);
        $this->assertCount(2, $parDeux, "3 photos par lots de 2 : une page de 2, une de 1.\n".implode("\n", $parDeux));
        foreach ($parDeux as $lecture) {
            $this->assertMatchesRegularExpression('/\blimit 2\b/', $lecture);
        }

        // Rien n'a été traité (file simulée) : chaque passage met les trois photos en file.
        Queue::assertPushed(RegeneratePhotoConversionsJob::class, 6);
        $this->assertEqualsCanonicalizing(
            $photos->map(fn (Media $media) => (int) $media->getKey())->all(),
            Queue::pushed(RegeneratePhotoConversionsJob::class)->map(fn ($job) => $job->mediaId)->unique()->values()->all(),
        );
    }

    public function test_the_chunk_must_be_a_positive_integer(): void
    {
        $this->artisan('media:regenerate-without-watermark', ['--chunk' => '0'])
            ->expectsOutputToContain('--chunk attend un entier')
            ->assertExitCode(2);
    }
}
