<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\WatermarkTrace;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-539 — R1 de la seconde passe adverse : ACTIVER le filigrane vidait la fiche publique de
 * toutes les photos existantes, sans signal, jusqu'à une régénération que rien ne lançait.
 */
class WatermarkActivationTest extends TestCase
{
    use RefreshDatabase;

    private FilesystemAdapter $public;

    protected function setUp(): void
    {
        parent::setUp();

        $this->public = RemoteDiskFake::install('r2-media');
        RemoteDiskFake::install('r2-private');
    }

    private function agence(?bool $filigrane): Agency
    {
        return Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => $filigrane === null ? [] : ['watermark_enabled' => $filigrane],
        ]);
    }

    private function photo(Agency $agency): array
    {
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $media = $property->addMedia(UploadedFile::fake()->image('villa.jpg', 2000, 1500))
            ->toMediaCollection('photos')
            ->refresh();

        return [$property, $media];
    }

    private function photosPubliques(Property $property): array
    {
        return $this->getJson('/api/public/properties/'.$property->slug)->assertOk()->json('data.photos');
    }

    // ── 1. Exemption : une photo produite sans filigrane reste servie après l'activation ───

    public function test_a_photo_produced_without_watermark_stays_served_after_activation(): void
    {
        $agency = $this->agence(false);
        [$property, $media] = $this->photo($agency);

        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::KEY, []));

        Queue::fake();
        $agency->update(['settings' => ['watermark_enabled' => true]]);

        $photos = $this->photosPubliques($property);
        $this->assertCount(1, $photos, 'Activer le filigrane ne doit pas vider la fiche.');
        $this->assertStringContainsString('-full.', $photos[0]['full']);
        $this->assertNotNull($this->getJson('/api/public/properties')->json('data.0.main_photo_url'));
    }

    /** …jusqu'à ce que la régénération mise en file la remplace par sa version filigranée. */
    public function test_the_queued_regeneration_replaces_exempt_conversions_with_watermarked_ones(): void
    {
        $agency = $this->agence(false);
        [$property, $media] = $this->photo($agency);
        $nu = $this->public->get($media->getPathRelativeToRoot('full'));

        // File synchrone : l'observateur met le job en file, il tourne aussitôt, et le filigrane
        // suit chaque conversion réécrite.
        $agency->update(['settings' => ['watermark_enabled' => true]]);

        $media->refresh();
        $this->assertEqualsCanonicalizing(Property::watermarkedConversions(), $media->getCustomProperty(WatermarkTrace::KEY, []));
        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertNotSame($nu, $this->public->get($media->getPathRelativeToRoot('full')), '`full` doit porter le filigrane.');
        $this->assertCount(1, $this->photosPubliques($property));
    }

    /** Fail-closed conservé : un envoi NEUF sous filigrane n'est pas exempté, il attend son filigrane. */
    public function test_a_new_upload_under_watermark_is_not_exempt(): void
    {
        $agency = $this->agence(true);
        Queue::fake([ApplyWatermarkJob::class]);

        [$property, $media] = $this->photo($agency);

        $this->assertSame([], $media->getCustomProperty(WatermarkTrace::EXEMPT_KEY, []));
        $this->assertSame([], $this->photosPubliques($property));
    }

    // ── 2. L'activation met la régénération en file, par chaque chemin qui écrit `settings` ──

    /** @return array<string, array{?bool, array<string, mixed>, bool}> */
    public static function transitions(): array
    {
        return [
            'false → true' => [false, ['watermark_enabled' => true], true],
            'false → clé retirée (défaut : true)' => [false, [], true],
            'true → false' => [true, ['watermark_enabled' => false], false],
            'true → true (autre réglage changé)' => [true, ['watermark_enabled' => true, 'watermark_opacity' => 30], false],
            'défaut → false' => [null, ['watermark_enabled' => false], false],
        ];
    }

    /** Chemin 1 — le modèle, quel que soit l'appelant (tinker, commande, écran futur). */
    #[DataProvider('transitions')]
    public function test_model_update_queues_regeneration_only_on_activation(?bool $avant, array $apres, bool $attendu): void
    {
        $agency = $this->agence($avant);
        Queue::fake();

        $agency->update(['settings' => $apres]);

        $attendu
            ? Queue::assertPushed(RegenerateAgencyWatermarksJob::class, fn (RegenerateAgencyWatermarksJob $job) => $job->agencyId === $agency->id)
            : Queue::assertNotPushed(RegenerateAgencyWatermarksJob::class);
    }

    /** Chemin 2 — `PUT /api/agencies/{id}`, le seul écrivain HTTP de `settings` (relevé par `grep`). */
    public function test_activation_through_the_api_queues_the_regeneration(): void
    {
        $agency = $this->agence(false);
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);
        Queue::fake();

        $this->putJson("/api/agencies/{$agency->id}", ['settings' => ['watermark_enabled' => true]])->assertOk();

        Queue::assertPushed(RegenerateAgencyWatermarksJob::class, fn (RegenerateAgencyWatermarksJob $job) => $job->agencyId === $agency->id);
    }

    public function test_an_update_that_does_not_touch_settings_queues_nothing(): void
    {
        $agency = $this->agence(false);
        Queue::fake();

        $agency->update(['name' => 'Autre nom']);

        Queue::assertNotPushed(RegenerateAgencyWatermarksJob::class);
    }

    // ── 3. Les données existantes : `--untraced` ───────────────────────────────────────────

    public function test_untraced_counts_then_repairs_photos_whose_conversions_are_neither_watermarked_nor_exempt(): void
    {
        $sous = $this->agence(true);
        $sans = $this->agence(false);

        [, $complete] = $this->photo($sous);
        [$bienCache, $cachee] = $this->photo($sous);
        [, $servie] = $this->photo($sans);

        // L'état d'une photo antérieure à la trace (ou dont le filigrane a échoué) : conversions
        // produites, trace vide.
        foreach ([$cachee, $servie] as $media) {
            $media->setCustomProperty(WatermarkTrace::KEY, [])->setCustomProperty(WatermarkTrace::EXEMPT_KEY, [])->save();
        }
        $this->assertSame([], $this->photosPubliques($bienCache), 'Précondition : la photo non tracée est cachée.');

        $this->artisan('media:regenerate-property-conversions', ['--untraced' => true, '--dry-run' => true])
            ->expectsOutputToContain('2 média à régénérer, 1 ignorés')
            ->expectsOutputToContain('1 photo(s) cachée(s) du public aujourd\'hui')
            ->assertSuccessful();

        $this->assertTrue(WatermarkTrace::hasUncovered($cachee->fresh()), '--dry-run ne répare rien.');

        $this->artisan('media:regenerate-property-conversions', ['--untraced' => true])->assertSuccessful();

        foreach ([$complete, $cachee, $servie] as $media) {
            $this->assertFalse(WatermarkTrace::hasUncovered($media->fresh()), "media {$media->id} doit être couvert.");
        }
        $this->assertCount(1, $this->photosPubliques($bienCache));
    }

    // ── 4. Échec définitif du filigrane : un signal ────────────────────────────────────────

    public function test_a_definitive_watermark_failure_is_logged_with_its_media_and_property(): void
    {
        $agency = $this->agence(true);
        Queue::fake([ApplyWatermarkJob::class]);
        [$property, $media] = $this->photo($agency);

        Log::spy();

        (new ApplyWatermarkJob($media->id, 'full'))->failed(new RuntimeException('R2 injoignable'));

        Log::shouldHaveReceived('error')->once()->withArgs(fn (string $message, array $context) => $context['media_id'] === $media->id
            && $context['property_id'] === $property->id
            && $context['conversion'] === 'full'
            && $context['exception'] === 'R2 injoignable');
    }

    /** Troisième passe adverse, R1a — la régénération qui suit une activation signale son échec. */
    public function test_a_definitive_regeneration_failure_is_logged_with_its_agency(): void
    {
        $agency = $this->agence(true);
        Log::spy();

        (new RegenerateAgencyWatermarksJob($agency->id))->failed(new RuntimeException('file perdue'));

        Log::shouldHaveReceived('error')->once()->withArgs(fn (string $message, array $context) => $context['agency_id'] === $agency->id
            && $context['exception'] === 'file perdue');
    }

    public function test_untraced_and_missing_only_do_not_combine(): void
    {
        $this->artisan('media:regenerate-property-conversions', ['--untraced' => true, '--missing-only' => true])
            ->assertFailed();

        $this->assertSame(0, Media::query()->count());
    }
}
