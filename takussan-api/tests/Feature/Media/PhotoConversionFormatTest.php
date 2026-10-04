<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ConvertPhotoConversionsToWebpJob;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\PhotoConversionFormat;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Media\WatermarkTrace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\Conversions\Events\ConversionWillStartEvent;
use Spatie\MediaLibrary\Conversions\FileManipulator;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-585 — les conversions d'une photo de bien sont produites en WebP, et le format se décide
 * PAR MÉDIA (ADR-0029, amendement du 2026-10-04, point 4).
 *
 * `getUrl()` calcule l'extension depuis la conversion déclarée, jamais depuis le fichier présent :
 * une photo antérieure au marqueur doit donc garder ses URL `.jpg`, sur des fichiers qui existent.
 */
class PhotoConversionFormatTest extends TestCase
{
    use RefreshDatabase;

    private const CONVERSIONS = ['thumbnail', 'preview', 'full'];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        RemoteDiskFake::install('r2-private');
    }

    private function photo(?UploadedFile $fichier = null): Media
    {
        $property = Property::factory()->create(['user_id' => User::factory()->create()->id]);

        return $property->addMedia($fichier ?? UploadedFile::fake()->image('villa.jpg', 2400, 1800))
            ->usingFileName('villa.jpg')
            ->toMediaCollection('photos')
            ->refresh();
    }

    private function mime(Media $media, string $conversion): string|false
    {
        $taille = getimagesize($media->getPath($conversion));

        return $taille === false ? false : $taille['mime'];
    }

    public function test_a_new_photo_carries_the_marker_and_is_converted_to_webp(): void
    {
        $media = $this->photo();

        $this->assertSame(PhotoConversionFormat::WEBP, $media->getCustomProperty(PhotoConversionFormat::KEY));

        foreach (self::CONVERSIONS as $conversion) {
            $this->assertTrue($media->hasGeneratedConversion($conversion), "`{$conversion}` doit être produite.");
            $this->assertStringEndsWith("-{$conversion}.webp", parse_url($media->getUrl($conversion), PHP_URL_PATH));
            $this->assertSame('image/webp', $this->mime($media, $conversion), "`{$conversion}` doit être un WebP, pas seulement en porter l'extension.");
        }
    }

    public function test_webp_conversions_keep_their_dimensions(): void
    {
        $media = $this->photo();

        $this->assertSame(1600, getimagesize($media->getPath('full'))[0]);
        $this->assertSame(800, getimagesize($media->getPath('preview'))[0]);
    }

    /**
     * Une photo antérieure au marqueur : URL et fichiers restent dans le format de la source.
     * Basculer les déclarations de tout le parc d'un coup aurait rendu ici une URL `.webp` sur un
     * fichier `.jpg` — un 404.
     */
    public function test_a_photo_without_the_marker_keeps_its_source_format(): void
    {
        $media = $this->photo();
        $media->forgetCustomProperty(PhotoConversionFormat::KEY);
        $media->save();

        app(FileManipulator::class)->createDerivedFiles($media);
        $media->refresh();

        foreach (self::CONVERSIONS as $conversion) {
            $this->assertStringEndsWith("-{$conversion}.jpg", parse_url($media->getUrl($conversion), PHP_URL_PATH));
            $this->assertSame('image/jpeg', $this->mime($media, $conversion));
        }
    }

    public function test_a_watermarked_agency_gets_webp_conversions_carrying_the_watermark(): void
    {
        $agency = Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => true],
        ]);
        $property = Property::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $agency->id]);

        $media = $property->addMedia(UploadedFile::fake()->image('villa.jpg', 1200, 900))
            ->usingFileName('villa.jpg')
            ->toMediaCollection('photos')
            ->refresh();

        foreach (self::CONVERSIONS as $conversion) {
            $this->assertSame('image/webp', $this->mime($media, $conversion));
            $this->assertContains($conversion, $media->getCustomProperty(WatermarkTrace::KEY, []), "`{$conversion}` doit être filigranée.");
        }
    }

    /** Une photo d'AVANT le marqueur : conversions écrites en `.jpg`, marqueur absent. */
    private function photoAncienne(): Media
    {
        return $this->rendreAncienne($this->photo());
    }

    /**
     * Retire le marqueur et régénère en `.jpg`. ⚠ Efface les `.webp` de la première génération :
     * restés sur le disque, ils rendaient « présent » le fichier qu'une URL émise trop tôt
     * viserait, et `test_during_the_switch…` restait vert sans la règle qu'il garde (mesuré par
     * ablation).
     */
    private function rendreAncienne(Media $media): Media
    {
        $webp = array_map(fn (string $c) => $media->getPathRelativeToRoot($c), self::CONVERSIONS);

        $media->forgetCustomProperty(PhotoConversionFormat::KEY);
        $media->save();
        app(FileManipulator::class)->createDerivedFiles($media);
        Storage::disk('public')->delete($webp);

        return $media->refresh();
    }

    public function test_the_switch_job_converts_a_legacy_photo_to_webp_and_removes_the_jpg_files(): void
    {
        $media = $this->photoAncienne();
        $anciens = array_map(fn (string $c) => $media->getPathRelativeToRoot($c), self::CONVERSIONS);

        foreach ($anciens as $ancien) {
            Storage::disk('public')->assertExists($ancien);
        }

        (new ConvertPhotoConversionsToWebpJob($media->id))->handle();
        $media->refresh();

        $this->assertTrue(PhotoConversionFormat::isWebp($media));

        foreach (self::CONVERSIONS as $conversion) {
            $this->assertTrue($media->hasGeneratedConversion($conversion));
            $this->assertStringEndsWith("-{$conversion}.webp", parse_url($media->getUrl($conversion), PHP_URL_PATH));
            $this->assertSame('image/webp', $this->mime($media, $conversion));
        }

        foreach ($anciens as $ancien) {
            Storage::disk('public')->assertMissing($ancien);
        }
    }

    /** Le fichier qu'une URL du disque public désigne existe-t-il ? */
    private function fichierExiste(string $url): bool
    {
        return Storage::disk('public')->exists(preg_replace('#^/?storage/#', '', ltrim((string) parse_url($url, PHP_URL_PATH), '/')));
    }

    /**
     * AC5 — PENDANT la bascule, l'API n'émet jamais l'URL d'un fichier absent : relevé juste
     * avant chaque conversion, l'URL publique est nulle (photo cachée) ou vise un fichier présent
     * — jamais un `.webp` à venir, jamais un `.jpg` supprimé.
     */
    public function test_during_the_switch_the_api_never_emits_the_url_of_a_missing_file(): void
    {
        $media = $this->photoAncienne();
        $vues = [];

        // L'existence se juge À L'INSTANT de l'événement : jugée après le job, quand tout est écrit,
        // ce test restait vert sans la règle qu'il garde (mesuré par ablation).
        Event::listen(ConversionWillStartEvent::class, function (ConversionWillStartEvent $event) use (&$vues) {
            foreach (self::CONVERSIONS as $demandee) {
                $url = PublicPhotoUrl::upTo($event->media->fresh(), $demandee, false);
                $vues[] = [$url, $url === null || $this->fichierExiste($url)];
            }
        });

        (new ConvertPhotoConversionsToWebpJob($media->id))->handle();

        $this->assertNotEmpty($vues);

        foreach ($vues as [$url, $existe]) {
            $this->assertTrue($existe, "URL émise pendant la bascule sur un fichier absent : {$url}");
        }
    }

    /**
     * Relevé en préproduction le 2026-10-04 : 858 biens sur 858 exigent le filigrane. Si la bascule
     * laisse `preview`, `full` ou le filigrane à la file, chaque photo reste cachée jusqu'à ce que la
     * file — remplie par les 3 446 autres bascules — arrive à ses jobs : tout le catalogue
     * disparaît pendant l'heure de la bascule. La photo doit sortir de SON job entièrement servie,
     * sans qu'aucun job en file n'ait tourné.
     */
    public function test_a_watermarked_photo_is_fully_served_at_the_end_of_its_own_switch_job(): void
    {
        $agency = Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => true],
        ]);
        $property = Property::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $agency->id]);
        $media = $this->rendreAncienne(
            $property->addMedia(UploadedFile::fake()->image('villa.jpg', 1200, 900))->usingFileName('villa.jpg')->toMediaCollection('photos')->refresh(),
        );

        Queue::fake();
        (new ConvertPhotoConversionsToWebpJob($media->id))->handle();
        $media->refresh();

        foreach (self::CONVERSIONS as $conversion) {
            $this->assertTrue($media->hasGeneratedConversion($conversion), "`{$conversion}` doit être produite dans le job même.");
            $this->assertContains($conversion, $media->getCustomProperty(WatermarkTrace::KEY, []), "`{$conversion}` doit être filigranée dans le job même.");
        }

        $url = PublicPhotoUrl::upTo($media, 'full', true);
        $this->assertNotNull($url);
        $this->assertStringEndsWith('-full.webp', parse_url($url, PHP_URL_PATH));
        $this->assertTrue($this->fichierExiste($url));
    }

    /** Un rejeu après un échec reprend la régénération ; une photo déjà basculée n'est pas réécrite. */
    public function test_the_switch_job_resumes_after_a_failure_and_skips_a_finished_photo(): void
    {
        $media = $this->photoAncienne();

        // L'état que laisse une tentative tombée après la bascule et avant la régénération.
        $media->setCustomProperty(PhotoConversionFormat::KEY, PhotoConversionFormat::WEBP);
        $media->generated_conversions = array_fill_keys(self::CONVERSIONS, false);
        $media->save();

        (new ConvertPhotoConversionsToWebpJob($media->id))->handle();
        $media->refresh();

        foreach (self::CONVERSIONS as $conversion) {
            $this->assertTrue($media->hasGeneratedConversion($conversion), "Le rejeu doit produire `{$conversion}`.");
        }

        $avant = $media->updated_at;
        $this->travel(5)->seconds();
        (new ConvertPhotoConversionsToWebpJob($media->id))->handle();

        $this->assertEquals($avant, $media->refresh()->updated_at, 'Une photo déjà basculée ne se régénère pas.');
    }

    public function test_the_command_queues_one_job_per_legacy_photo_only(): void
    {
        $ancienne = $this->photoAncienne();
        $neuve = $this->photo();

        Queue::fake();

        $this->artisan('media:convert-photos-to-webp', ['--dry-run' => true])->assertSuccessful();
        Queue::assertNothingPushed();

        $this->artisan('media:convert-photos-to-webp')->assertSuccessful();

        $this->assertSame(
            [$ancienne->id],
            Queue::pushed(ConvertPhotoConversionsToWebpJob::class)->map(fn (ConvertPhotoConversionsToWebpJob $job) => $job->mediaId)->all(),
        );
        $this->assertNotSame($ancienne->id, $neuve->id);
    }

    public function test_only_property_photos_are_marked(): void
    {
        $property = Property::factory()->create(['user_id' => User::factory()->create()->id]);
        $plan = $property->addMedia(UploadedFile::fake()->image('plan.jpg', 400, 300))->toMediaCollection('plans');

        $user = User::factory()->create();
        $avatar = $user->addMedia(UploadedFile::fake()->image('moi.jpg', 200, 200))->toMediaCollection('avatar');

        $this->assertFalse($plan->hasCustomProperty(PhotoConversionFormat::KEY));
        $this->assertFalse($avatar->hasCustomProperty(PhotoConversionFormat::KEY));
    }
}
