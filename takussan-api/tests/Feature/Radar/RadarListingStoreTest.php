<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Jobs\Radar\ExtractRadarListing;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Radar\RadarListingIntake;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Exceptions\FileIsTooBig;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0077 §2) — la saisie d'une annonce par l'opérateur : une URL, un texte collé ou des
 * captures ; la fiche existante pour une empreinte déjà connue (AC2) ; le refus STOP dès la saisie
 * (AC6) ; le geste `platform.radar.operate` (AC7) ; la liste et le tableau de bord.
 */
class RadarListingStoreTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const TEXTE = 'Appartement F4 à louer aux Almadies, 3 chambres, 450.000f/mois. Contact 77 123 45 67';

    /** @var list<string> */
    private array $temporaires = [];

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        RadarExtraction::fake();
    }

    protected function tearDown(): void
    {
        foreach ($this->temporaires as $chemin) {
            @unlink($chemin);
        }
        parent::tearDown();
    }

    private function support(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);
    }

    // --- AC2 ------------------------------------------------------------------------------------

    public function test_ac2_pasting_the_same_text_twice_returns_the_same_listing_without_a_second_job(): void
    {
        $this->support();

        $premier = $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])
            ->assertCreated()
            ->assertJsonPath('data.0.stage', 'captured')
            ->assertJsonPath('data.0.existing', false);

        // Même annonce, autrement écrite : casse, blancs et chiffres pleine chasse repliés.
        $second = $this->postJson('/api/admin/radar/listings', [
            'text' => "  appartement F4 à louer aux   ALMADIES,\n3 chambres, ４５０.000f/mois. Contact 77 123 45 67 ",
        ])->assertCreated()->assertJsonPath('data.0.existing', true);

        $this->assertSame($premier->json('data.0.id'), $second->json('data.0.id'));
        $this->assertSame(1, RadarListing::query()->count());
        Queue::assertPushed(ExtractRadarListing::class, 1);
        Queue::assertPushed(ExtractRadarListing::class, fn (ExtractRadarListing $job) => $job->listingId === $premier->json('data.0.id'));
        RadarExtraction::assertNeverPrompted();

        $fiche = RadarListing::query()->sole();
        $this->assertSame(RadarSourceKind::Text, $fiche->source_kind);
        $this->assertSame(RadarSourceSite::Other, $fiche->source_site);
        $this->assertSame(self::TEXTE, $fiche->raw_text);
        $this->assertNotNull($fiche->captured_by);
        $this->assertNotNull($fiche->purge_at);
    }

    // --- F2 (revue finale) : une extraction en échec se relance en recollant l'annonce ----------

    public function test_f2_pasting_again_a_listing_whose_extraction_failed_requeues_it(): void
    {
        $this->support();
        $id = $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])->assertCreated()->json('data.0.id');
        RadarListing::query()->whereKey($id)->update(['stage' => RadarListingStage::ExtractionFailed->value, 'stage_reason' => 'ai.provider_auth']);

        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])
            ->assertCreated()
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.existing', true)
            ->assertJsonPath('data.0.requeued', true)
            ->assertJsonPath('data.0.stage', 'captured');

        $fiche = RadarListing::query()->sole();
        $this->assertSame(RadarListingStage::Captured, $fiche->stage);
        $this->assertNull($fiche->stage_reason);
        Queue::assertPushed(ExtractRadarListing::class, 2);

        // Remise en file une fois : un troisième renvoi la trouve `captured`, et ne relance rien.
        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])
            ->assertCreated()
            ->assertJsonPath('data.0.existing', true)
            ->assertJsonPath('data.0.requeued', false);
        Queue::assertPushed(ExtractRadarListing::class, 2);
    }

    public function test_f2_a_concurrent_paste_that_already_requeued_the_listing_dispatches_nothing_more(): void
    {
        $this->support();
        $id = $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])->assertCreated()->json('data.0.id');
        RadarListing::query()->whereKey($id)->update(['stage' => RadarListingStage::ExtractionFailed->value, 'stage_reason' => 'ai.budget']);

        // L'autre renvoi passe entre la lecture de celui-ci et son écriture.
        $fait = false;
        RadarListing::retrieved(function (RadarListing $fiche) use (&$fait): void {
            if (! $fait && $fiche->stage === RadarListingStage::ExtractionFailed) {
                $fait = true;
                RadarListing::query()->whereKey($fiche->id)->update(['stage' => RadarListingStage::Captured->value, 'stage_reason' => null]);
            }
        });

        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])
            ->assertCreated()
            ->assertJsonPath('data.0.existing', true)
            ->assertJsonPath('data.0.requeued', false);

        $this->assertTrue($fait);
        Queue::assertPushed(ExtractRadarListing::class, 1);
    }

    public function test_f2_other_stages_of_a_known_listing_are_left_as_they_are(): void
    {
        $this->support();
        $id = $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])->assertCreated()->json('data.0.id');

        foreach ([RadarListingStage::Extracted, RadarListingStage::Duplicate, RadarListingStage::DoNotContact, RadarListingStage::Refused, RadarListingStage::Purged, RadarListingStage::Published] as $etape) {
            RadarListing::query()->whereKey($id)->update(['stage' => $etape->value, 'stage_reason' => 'motif.garde']);

            $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])
                ->assertCreated()
                ->assertJsonPath('data.0.stage', $etape->value)
                ->assertJsonPath('data.0.requeued', false);
            $this->assertSame([$etape, 'motif.garde'], [RadarListing::query()->sole()->stage, RadarListing::query()->sole()->stage_reason], $etape->value);
        }
        Queue::assertPushed(ExtractRadarListing::class, 1);
    }

    public function test_f2_failed_url_and_captures_listings_are_requeued_too(): void
    {
        $this->support();
        $url = $this->postJson('/api/admin/radar/listings', ['urls' => ['https://www.coinafrique.com/annonce/42']])->assertCreated()->json('data.0.id');
        $capture = fn () => UploadedFile::fake()->image('a.png', 40, 40);
        $captures = $this->post('/api/admin/radar/listings', ['captures' => [$capture()]], ['Accept' => 'application/json'])->assertCreated()->json('data.0.id');
        RadarListing::query()->whereKey([$url, $captures])->update(['stage' => RadarListingStage::ExtractionFailed->value, 'stage_reason' => 'radar.fetch.timeout']);

        $this->postJson('/api/admin/radar/listings', ['urls' => ['https://www.coinafrique.com/annonce/42?utm_source=x']])
            ->assertCreated()
            ->assertJsonPath('data.0.id', $url)
            ->assertJsonPath('data.0.requeued', true);
        $this->post('/api/admin/radar/listings', ['captures' => [$capture()]], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.0.id', $captures)
            ->assertJsonPath('data.0.requeued', true);

        $this->assertSame(0, RadarListing::query()->where('stage', RadarListingStage::ExtractionFailed->value)->count());
        Queue::assertPushed(ExtractRadarListing::class, 4);
    }

    public function test_the_text_source_site_is_kept_when_given(): void
    {
        $this->support();

        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE, 'source_site' => 'facebook'])->assertCreated();

        $this->assertSame(RadarSourceSite::Facebook, RadarListing::query()->sole()->source_site);
    }

    // --- AC6 ------------------------------------------------------------------------------------

    public function test_ac6_a_listing_for_a_number_that_said_stop_is_do_not_contact_at_intake_without_any_job(): void
    {
        $this->support();
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac('+221771234567')]);

        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])
            ->assertCreated()
            ->assertJsonPath('data.0.stage', 'do_not_contact')
            ->assertJsonPath('data.0.existing', false);

        $fiche = RadarListing::query()->sole();
        $this->assertSame(RadarListingStage::DoNotContact, $fiche->stage);
        $this->assertSame($stop->id, $fiche->radar_advertiser_id);
        Queue::assertNothingPushed();
        RadarExtraction::assertNeverPrompted();
    }

    public function test_a_known_number_that_did_not_say_stop_goes_to_extraction(): void
    {
        $this->support();
        RadarAdvertiser::factory()->create(['phone' => '+221771234567']);

        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])->assertJsonPath('data.0.stage', 'captured');

        Queue::assertPushed(ExtractRadarListing::class, 1);
    }

    // --- AC7 ------------------------------------------------------------------------------------

    public function test_ac7_a_viewer_is_refused_even_with_an_invalid_body_and_a_support_captures(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])->assertForbidden();
        $this->postJson('/api/admin/radar/listings', [])->assertForbidden();
        $this->getJson('/api/admin/radar/listings')->assertForbidden();
        $this->getJson('/api/admin/radar/dashboard')->assertForbidden();
        $this->assertSame(0, RadarListing::query()->count());

        $this->support();
        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])->assertCreated();
        $this->assertSame(1, RadarListing::query()->count());
    }

    // --- Exclusivité et bornes -----------------------------------------------------------------

    public function test_exactly_one_of_the_three_inputs_is_accepted(): void
    {
        $this->support();

        $this->postJson('/api/admin/radar/listings', [])->assertUnprocessable();
        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE, 'urls' => ['https://www.coinafrique.com/a/1']])
            ->assertUnprocessable();
        $this->post('/api/admin/radar/listings', [
            'text' => self::TEXTE,
            'captures' => [UploadedFile::fake()->image('a.png')],
        ], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->postJson('/api/admin/radar/listings', ['text' => 'trop court'])->assertUnprocessable()->assertJsonValidationErrors('text');
        $this->postJson('/api/admin/radar/listings', ['urls' => ['ftp://exemple.sn/a']])->assertUnprocessable();
        $this->postJson('/api/admin/radar/listings', ['urls' => array_map(fn ($i) => "https://www.coinafrique.com/a/{$i}", range(1, 21))])
            ->assertUnprocessable()->assertJsonValidationErrors('urls');
        $this->postJson('/api/admin/radar/listings', ['urls' => ['https://www.coinafrique.com/a/1'], 'source_site' => 'facebook'])
            ->assertUnprocessable();

        $this->assertSame(0, RadarListing::query()->count());
        Queue::assertNothingPushed();
    }

    public function test_an_airbnb_url_is_refused_with_its_code(): void
    {
        $this->support();

        // Casse, point final, lien court, pleine chasse (lue par IDN comme le client HTTP la lirait).
        foreach (['https://www.airbnb.fr/rooms/123', 'https://WWW.AIRBNB.COM./rooms/1', 'https://abnb.me/xyz', 'https://ａｉｒｂｎｂ.fr/rooms/9'] as $url) {
            $this->postJson('/api/admin/radar/listings', ['urls' => ['https://www.coinafrique.com/a/1', $url]])
                ->assertUnprocessable()
                ->assertJsonPath('code', 'radar.url.airbnb')
                // F7 (revue finale) : l'URL refusée d'un lot est nommée par son rang.
                ->assertJsonPath('params.field', 'urls.1');
        }

        $this->assertSame(0, RadarListing::query()->count());
    }

    // --- URL ------------------------------------------------------------------------------------

    public function test_several_urls_give_several_listings_and_a_known_one_is_flagged_existing(): void
    {
        $this->support();

        $premier = $this->postJson('/api/admin/radar/listings', ['urls' => [
            'https://www.CoinAfrique.com/annonce/42/?utm_source=facebook&ref=7&fbclid=abc#photos',
            'https://www.expat-dakar.com/appartements/9',
        ]])->assertCreated()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.existing', false)
            ->assertJsonPath('data.1.existing', false);

        $coinafrique = RadarListing::query()->findOrFail($premier->json('data.0.id'));
        $this->assertSame(RadarSourceKind::Url, $coinafrique->source_kind);
        $this->assertSame(RadarSourceSite::Coinafrique, $coinafrique->source_site);
        $this->assertSame('https://www.coinafrique.com/annonce/42?ref=7', $coinafrique->source_url);
        $this->assertSame(RadarSourceSite::ExpatDakar, RadarListing::query()->findOrFail($premier->json('data.1.id'))->source_site);

        $second = $this->postJson('/api/admin/radar/listings', ['urls' => [
            'https://www.coinafrique.com/annonce/42?ref=7',
            'https://web.facebook.com/groups/immo/posts/1',
        ]])->assertCreated()
            ->assertJsonPath('data.0.id', $premier->json('data.0.id'))
            ->assertJsonPath('data.0.existing', true)
            ->assertJsonPath('data.1.existing', false);

        $this->assertSame(3, RadarListing::query()->count());
        $this->assertSame(RadarSourceSite::Facebook, RadarListing::query()->findOrFail($second->json('data.1.id'))->source_site);
        Queue::assertPushed(ExtractRadarListing::class, 3);
    }

    // --- Captures -------------------------------------------------------------------------------

    public function test_captures_are_stored_without_exif_with_the_original_sha256(): void
    {
        $this->support();
        $original = $this->jpegAvecExif();
        $this->assertSame('TakussanCam', $this->exif($original)['Make'] ?? null, 'le témoin doit porter un EXIF lisible');

        $reponse = $this->post('/api/admin/radar/listings', [
            'captures' => [UploadedFile::fake()->createWithContent('annonce.jpg', $original), UploadedFile::fake()->image('b.png', 20, 20)],
            'source_site' => 'whatsapp',
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.0.existing', false);

        $fiche = RadarListing::query()->findOrFail($reponse->json('data.0.id'));
        $this->assertSame(RadarSourceKind::Captures, $fiche->source_kind);
        $this->assertSame(RadarSourceSite::Whatsapp, $fiche->source_site);
        $medias = $fiche->getMedia('radar_captures');
        $this->assertCount(2, $medias);

        $jpeg = $medias->firstWhere('mime_type', 'image/jpeg');
        $this->assertNotNull($jpeg);
        $this->assertSame(hash('sha256', $original), $jpeg->getCustomProperty('sha256'));
        $stocke = (string) stream_get_contents($jpeg->stream());
        $this->assertNotSame('', $stocke);
        $this->assertStringNotContainsString("Exif\x00\x00", $stocke);
        $this->assertArrayNotHasKey('Make', $this->exif($stocke));
        $this->assertNotSame(config('media-library.public_disk_name'), $jpeg->disk);
        Queue::assertPushed(ExtractRadarListing::class, 1);

        // Les mêmes captures, dans l'autre ordre : la fiche existante, sans second job.
        $this->post('/api/admin/radar/listings', [
            'captures' => [UploadedFile::fake()->image('b.png', 20, 20), UploadedFile::fake()->createWithContent('autre-nom.jpg', $original)],
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('data.0.id', $fiche->id)
            ->assertJsonPath('data.0.existing', true);
        Queue::assertPushed(ExtractRadarListing::class, 1);
    }

    public function test_a_capture_that_is_not_an_image_is_refused(): void
    {
        $this->support();

        // Le type se lit dans le CONTENU, pas dans le nom : un PDF nommé `.jpg` est refusé.
        $this->post('/api/admin/radar/listings', [
            'captures' => [$this->televerse('annonce.jpg', "%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF")],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('captures.0');

        // Une image d'un autre type (GIF) aussi.
        $this->post('/api/admin/radar/listings', [
            'captures' => [$this->televerse('a.gif', (string) base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'))],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('captures.0');

        // Un type annoncé image mais un contenu qui ne se décode pas : refusé par son code, sans fiche.
        $this->post('/api/admin/radar/listings', [
            'captures' => [UploadedFile::fake()->createWithContent('annonce.jpg', "\xFF\xD8\xFF tronqué")],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonPath('code', 'radar.captures.unreadable');

        $this->assertSame(0, RadarListing::query()->count());
        Queue::assertNothingPushed();
    }

    public function test_too_many_or_too_large_captures_are_refused(): void
    {
        $this->support();

        $this->post('/api/admin/radar/listings', [
            'captures' => array_map(fn ($i) => UploadedFile::fake()->image("c{$i}.png", 4, 4), range(1, 11)),
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('captures');

        $this->post('/api/admin/radar/listings', [
            'captures' => [UploadedFile::fake()->image('lourde.png')->size(8_193)],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('captures.0');

        $this->assertSame(0, RadarListing::query()->count());
    }

    // --- Correctifs de revue ----------------------------------------------------------------------

    public function test_an_oversized_capture_is_refused_from_its_header_before_any_decode(): void
    {
        $this->support();

        // Un côté au-delà de la borne, puis une surface au-delà du budget (49 Mpx) : 422 par code,
        // lu dans l'en-tête — GD n'alloue rien.
        foreach ([[20_001, 1], [7_000, 7_000]] as [$largeur, $hauteur]) {
            $this->post('/api/admin/radar/listings', [
                'captures' => [UploadedFile::fake()->createWithContent('grande.png', $this->pngDeDimensions($largeur, $hauteur))],
            ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonPath('code', 'radar.captures.too_large');
        }

        // Une longue capture défilée (1080 × 15 000) passe la borne : elle n'échoue qu'au décodage,
        // parce que ses pixels sont ici inventés.
        $this->post('/api/admin/radar/listings', [
            'captures' => [UploadedFile::fake()->createWithContent('longue.png', $this->pngDeDimensions(1_080, 15_000))],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonPath('code', 'radar.captures.unreadable');

        $this->assertSame(0, RadarListing::query()->count());
    }

    public function test_captures_already_known_are_found_before_any_decode_or_bound(): void
    {
        $this->support();
        $capture = fn () => UploadedFile::fake()->image('a.png', 40, 40);
        $premier = $this->post('/api/admin/radar/listings', ['captures' => [$capture()]], ['Accept' => 'application/json'])->assertCreated();

        // Borne abaissée sous la taille de l'image : un renvoi n'est pas relu, il rend la fiche.
        config(['radar.captures.max_pixels' => 10]);
        $this->post('/api/admin/radar/listings', ['captures' => [$capture()]], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.0.id', $premier->json('data.0.id'))
            ->assertJsonPath('data.0.existing', true);
    }

    public function test_a_failing_capture_write_leaves_neither_listing_nor_file(): void
    {
        $user = User::factory()->create();
        $petite = UploadedFile::fake()->image('petite.png', 4, 4);
        $grosse = UploadedFile::fake()->createWithContent('grosse.png', $this->pngBruite(200, 200));
        // La bibliothèque refuse le second fichier APRÈS avoir écrit le premier.
        config(['media-library.max_file_size' => 2_000]);

        try {
            app(RadarListingIntake::class)->fromCaptures([$petite, $grosse], null, $user);
            $this->fail('Le second fichier aurait dû être refusé.');
        } catch (FileIsTooBig) {
        }

        $this->assertSame(0, RadarListing::query()->count());
        $this->assertSame([], Storage::disk(config('media-library.disk_name'))->allFiles());
        Queue::assertNothingPushed();
    }

    public function test_a_url_whose_host_cannot_be_read_is_refused_rather_than_let_through(): void
    {
        $this->support();

        // Un label de 64 caractères non ASCII : la règle `url` l'accepte, la conversion IDN non.
        $this->postJson('/api/admin/radar/listings', ['urls' => ['https://'.str_repeat('é', 64).'.com/annonce']])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'radar.url.invalid')
            ->assertJsonPath('params.field', 'urls.0');

        $this->assertSame(0, RadarListing::query()->count());
    }

    public function test_url_variants_of_one_listing_share_its_fingerprint(): void
    {
        $this->support();

        $premier = $this->postJson('/api/admin/radar/listings', ['urls' => [
            'http://m.facebook.com/groups/1/posts/2?mibextid=abc&rdid=x&__cft__%5B0%5D=zz&__tn__=R&b=2&a=1',
        ]])->assertCreated()->assertJsonPath('data.0.existing', false);
        $this->assertSame('http://facebook.com/groups/1/posts/2?a=1&b=2', RadarListing::query()->sole()->source_url);

        // Autre schéma, autre sous-domaine, identifiants, ordre des paramètres, `gclid`, `/` final, fragment.
        foreach ([
            'https://user:secret@www.facebook.com/groups/1/posts/2/?a=1&gclid=q&b=2#commentaires',
            'https://web.facebook.com/groups/1/posts/2?b=2&a=1',
        ] as $variante) {
            $this->postJson('/api/admin/radar/listings', ['urls' => [$variante]])
                ->assertCreated()
                ->assertJsonPath('data.0.id', $premier->json('data.0.id'))
                ->assertJsonPath('data.0.existing', true);
        }
        $this->assertSame(1, RadarListing::query()->count());
    }

    public function test_png_text_and_webp_exif_metadata_do_not_survive(): void
    {
        $this->support();
        $png = $this->pngAvecTexte('Comment', 'gps-14.6937N-17.4441W');
        $webp = $this->webpAvecExif('gps-14.6937N-17.4441W');
        $this->assertStringContainsString('gps-14.6937N', $png, 'le témoin PNG porte son texte');
        $this->assertStringContainsString('gps-14.6937N', $webp, 'le témoin WebP porte son EXIF');

        $reponse = $this->post('/api/admin/radar/listings', ['captures' => [
            UploadedFile::fake()->createWithContent('a.png', $png),
            UploadedFile::fake()->createWithContent('b.webp', $webp),
        ]], ['Accept' => 'application/json'])->assertCreated();

        $medias = RadarListing::query()->findOrFail($reponse->json('data.0.id'))->getMedia('radar_captures');
        $this->assertEqualsCanonicalizing(['image/png', 'image/webp'], $medias->pluck('mime_type')->all());
        foreach ($medias as $media) {
            $stocke = (string) stream_get_contents($media->stream());
            $this->assertNotSame('', $stocke);
            $this->assertStringNotContainsString('gps-14.6937N', $stocke, $media->mime_type);
        }
    }

    public function test_the_index_includes_the_advertiser_only(): void
    {
        $this->support();
        $annonceur = RadarAdvertiser::factory()->create();
        RadarListing::factory()->create(['radar_advertiser_id' => $annonceur->id]);

        $this->getJson('/api/admin/radar/listings?include=advertiser')
            ->assertOk()
            ->assertJsonPath('data.0.advertiser.id', $annonceur->id);
        $this->getJson('/api/admin/radar/listings')->assertOk()->assertJsonMissingPath('data.0.advertiser');
        $this->getJson('/api/admin/radar/listings?include=capturer')->assertStatus(400);
        $this->getJson('/api/admin/radar/listings?include=property')->assertStatus(400);
    }

    // --- Liste et fiche -------------------------------------------------------------------------

    public function test_the_index_filters_by_stage_site_and_advertiser_with_sparse_fieldsets(): void
    {
        $this->support();
        $annonceur = RadarAdvertiser::factory()->create();
        $relire = RadarListing::factory()->create(['stage' => RadarListingStage::Extracted, 'source_site' => RadarSourceSite::Coinafrique, 'radar_advertiser_id' => $annonceur->id]);
        RadarListing::factory()->create(['stage' => RadarListingStage::Captured, 'source_site' => RadarSourceSite::Coinafrique]);
        $facebook = RadarListing::factory()->create(['stage' => RadarListingStage::Extracted, 'source_site' => RadarSourceSite::Facebook]);

        $parEtape = $this->getJson('/api/admin/radar/listings?filter[stage]=extracted&fields[radar_listings]=id,stage')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
        $this->assertEqualsCanonicalizing([$relire->id, $facebook->id], array_column($parEtape->json('data'), 'id'));
        $this->assertSame(['id', 'stage'], array_keys($parEtape->json('data.0')));
        $this->assertSame(['total', 'per_page', 'current_page', 'last_page'], array_keys($parEtape->json('meta')));

        $this->getJson('/api/admin/radar/listings?filter[source_site]=facebook')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $facebook->id);
        $this->getJson("/api/admin/radar/listings?filter[advertiser_id]={$annonceur->id}")
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $relire->id);
    }

    public function test_show_returns_the_listing(): void
    {
        $this->support();
        $fiche = RadarListing::factory()->create(['stage_reason' => 'ai.budget']);

        $this->getJson("/api/admin/radar/listings/{$fiche->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $fiche->id)
            ->assertJsonPath('data.stage', 'captured')
            ->assertJsonPath('data.stage_reason', 'ai.budget')
            ->assertJsonPath('data.raw_text', $fiche->raw_text);
    }

    // --- Tableau de bord ------------------------------------------------------------------------

    public function test_the_dashboard_counts_stages_pending_extraction_and_today_s_ai_cost_against_the_caps(): void
    {
        $this->support();
        config(['ai.budgets.daily_global_xof' => 5000.0]);
        RadarListing::factory()->count(2)->create(['stage' => RadarListingStage::Extracted]);
        RadarListing::factory()->create(['stage' => RadarListingStage::Captured]);
        RadarListing::factory()->create(['stage' => RadarListingStage::Captured, 'stage_reason' => 'ai.budget']);
        RadarListing::factory()->create(['stage' => RadarListingStage::ExtractionFailed, 'stage_reason' => 'radar.fetch.robots']);

        $appel = fn (string $usage, float $cout, array $extra = []) => AiCall::query()->create($extra + ['usage_key' => $usage, 'outcome' => 'success', 'cost_estimate' => $cout]);
        $appel('radar.extraction', 12.5);
        $appel('radar.extraction', 7.5);
        $appel('radar.extraction', 100, ['is_evaluation' => true]);
        $appel('autre.usage', 3);
        $appel('radar.extraction', 50)->forceFill(['created_at' => now()->subDay()])->save();

        $data = $this->getJson('/api/admin/radar/dashboard')->assertOk()->json('data');

        $this->assertSame(2, $data['stages']['extracted']);
        $this->assertSame(2, $data['stages']['captured']);
        $this->assertSame(1, $data['stages']['extraction_failed']);
        $this->assertSame(0, $data['stages']['published']);
        $this->assertSame(array_column(RadarListingStage::cases(), 'value'), array_keys($data['stages']));
        $this->assertSame(1, $data['pending_extraction']);
        $this->assertEquals(20.0, $data['ai']['spent_today_xof']);
        $this->assertEquals(2000.0, $data['ai']['daily_budget_xof']);
        $this->assertEquals(23.0, $data['ai']['global_spent_today_xof']);
        $this->assertEquals(5000.0, $data['ai']['global_daily_budget_xof']);

        AiUsageSetting::query()->create(['usage_key' => 'radar.extraction', 'daily_budget_xof' => 1500]);
        $this->getJson('/api/admin/radar/dashboard')->assertOk()->assertJsonPath('data.ai.daily_budget_xof', 1500);
    }

    // --- Outils ---------------------------------------------------------------------------------

    /** Un JPEG de 8×8 px auquel on greffe à la main un segment APP1 « Exif » (IFD0 : `Make`). */
    private function jpegAvecExif(): string
    {
        $image = imagecreatetruecolor(8, 8);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 168, 83, 50));
        ob_start();
        imagejpeg($image);
        $jpeg = (string) ob_get_clean();

        $make = "TakussanCam\0";
        $tiff = "II*\x00".pack('V', 8)
            .pack('v', 1)
            .pack('vvVV', 0x010F, 2, strlen($make), 8 + 2 + 12 + 4)
            .pack('V', 0)
            .$make;
        $charge = "Exif\x00\x00".$tiff;

        return substr($jpeg, 0, 2)."\xFF\xE1".pack('n', strlen($charge) + 2).$charge.substr($jpeg, 2);
    }

    /** Un vrai PNG de 1 px dont l'en-tête IHDR annonce d'autres dimensions (CRC recalculé). */
    private function pngDeDimensions(int $largeur, int $hauteur): string
    {
        $png = $this->pngBruite(1, 1);
        $ihdr = pack('NN', $largeur, $hauteur).substr($png, 24, 5);

        return substr($png, 0, 16).$ihdr.pack('N', crc32('IHDR'.$ihdr)).substr($png, 33);
    }

    /** Un PNG aux pixels pseudo-aléatoires : il ne se comprime pas, sa taille suit ses dimensions. */
    private function pngBruite(int $largeur, int $hauteur): string
    {
        $image = imagecreatetruecolor($largeur, $hauteur);
        mt_srand(2386);
        for ($x = 0; $x < $largeur; $x++) {
            for ($y = 0; $y < $hauteur; $y++) {
                imagesetpixel($image, $x, $y, mt_rand(0, 0xFFFFFF));
            }
        }
        ob_start();
        imagepng($image);

        return (string) ob_get_clean();
    }

    /** Un PNG qui porte un bloc `tEXt` greffé avant `IEND`. */
    private function pngAvecTexte(string $cle, string $texte): string
    {
        $png = $this->pngBruite(6, 6);
        $donnees = $cle."\0".$texte;
        $bloc = pack('N', strlen($donnees)).'tEXt'.$donnees.pack('N', crc32('tEXt'.$donnees));
        $iend = strrpos($png, 'IEND') - 4;

        return substr($png, 0, $iend).$bloc.substr($png, $iend);
    }

    /** Un WebP étendu (VP8X, drapeau EXIF) qui porte un bloc `EXIF` après l'image de GD. */
    private function webpAvecExif(string $texte): string
    {
        $image = imagecreatetruecolor(6, 6);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 93, 110, 79));
        ob_start();
        imagewebp($image);
        $simple = (string) ob_get_clean();
        $blocs = substr($simple, 12);                                    // après « RIFF<taille>WEBP »

        $vp8x = 'VP8X'.pack('V', 10).chr(0x08)."\0\0\0".substr(pack('V', 6 - 1), 0, 3).substr(pack('V', 6 - 1), 0, 3);
        $exif = "II*\x00".pack('V', 8).pack('v', 0).pack('V', 0).$texte;
        $exif .= strlen($exif) % 2 === 1 ? "\0" : '';
        $blocExif = 'EXIF'.pack('V', strlen($exif)).$exif;
        $corps = 'WEBP'.$vp8x.$blocs.$blocExif;

        return 'RIFF'.pack('V', strlen($corps)).$corps;
    }

    /** Un vrai fichier téléversé : son type se devine dans le contenu (le faux de Laravel le lit dans le nom). */
    private function televerse(string $nom, string $octets): UploadedFile
    {
        $chemin = $this->temporaires[] = (string) tempnam(sys_get_temp_dir(), 'radar');
        file_put_contents($chemin, $octets);

        return new UploadedFile($chemin, $nom, null, null, true);
    }

    /** @return array<string, mixed> */
    private function exif(string $octets): array
    {
        $fichier = tempnam(sys_get_temp_dir(), 'exif');
        file_put_contents($fichier, $octets);
        try {
            $lu = @exif_read_data($fichier);

            return is_array($lu) ? $lu : [];
        } finally {
            unlink($fichier);
        }
    }
}
