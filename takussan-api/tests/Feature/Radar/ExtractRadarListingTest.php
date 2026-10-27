<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Jobs\Radar\ExtractRadarListing;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\HostResolver;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Files\StoredImage;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0077 §5) — le job d'extraction d'une annonce saisie : il lit l'URL s'il le faut,
 * refuse un numéro qui a dit STOP sans appeler le modèle, appelle `radar.extraction` par la
 * passerelle, relit la sortie par `ExtractionNormalizer` et rattache l'annonceur. Une panne, un
 * plafond ou un coupe-circuit laissent l'annonce « en attente » ; un refus définitif la fait passer
 * en `extraction_failed` avec son code.
 *
 * Aucun réseau ni modèle : `RadarExtraction::fake()`, `Http::preventStrayRequests()` et un
 * résolveur DNS doublé.
 */
class ExtractRadarListingTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private const TEXTE = 'Appartement F4 à louer aux Almadies, 3 chambres, 450.000f/mois. Contact Moussa 77 123 45 67';

    private const NUMERO = '+221771234567';

    private const HOTE = 'sn.coinafrique.com';

    /** Une capture PNG d'un pixel. */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
        ]);
        // Le catalogue et les prompts RÉELS : c'est l'usage livré que le job appelle.
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);

        Http::preventStrayRequests();
        Cache::flush();
        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function resolve(string $host): array
            {
                return $host === 'sn.coinafrique.com' ? ['93.184.216.34'] : [];
            }
        });

        $this->operateur = $this->operateur(PlatformProfileLevel::Support);
    }

    /**
     * Une sortie complète du modèle : chaque champ vide, sauf ceux donnés.
     *
     * @param  array<string, mixed>  $champs
     * @return array<string, mixed>
     */
    private function reponse(array $champs = []): array
    {
        $vide = ['value' => null, 'confidence' => 'low', 'evidence' => null];
        $base = array_fill_keys([...RadarExtraction::PROPERTY_FIELDS, 'advertiser_name'], $vide);
        $base['advertiser_nature'] = ['value' => 'unknown', 'confidence' => 'low', 'evidence' => null];
        $base['phones'] = [];
        $base['nature_signals'] = [];

        return array_replace($base, $champs);
    }

    /** @return array<string, mixed> */
    private function reponseComplete(): array
    {
        return $this->reponse([
            'property_type' => ['value' => 'apartment', 'confidence' => 'high', 'evidence' => 'Appartement F4'],
            'contract' => ['value' => 'rent', 'confidence' => 'high', 'evidence' => 'à louer'],
            'price' => ['value' => '450.000f/mois', 'confidence' => 'high', 'evidence' => '450.000f/mois'],
            'bedrooms' => ['value' => 3, 'confidence' => 'high', 'evidence' => '3 chambres'],
            'advertiser_name' => ['value' => 'Moussa', 'confidence' => 'medium', 'evidence' => 'Contact Moussa'],
            'phones' => ['77 123 45 67'],
        ]);
    }

    /** @param  array<string, mixed>  $attributs */
    private function annonce(array $attributs = []): RadarListing
    {
        return RadarListing::factory()->create($attributs + [
            'raw_text' => self::TEXTE,
            'content_fingerprint' => hash('sha256', 'text|'.($attributs['raw_text'] ?? self::TEXTE).microtime()),
            'captured_by' => $this->operateur->id,
        ]);
    }

    private function annonceUrl(string $url = 'https://sn.coinafrique.com/annonce/42'): RadarListing
    {
        return $this->annonce([
            'source_kind' => RadarSourceKind::Url,
            'source_site' => RadarSourceSite::Coinafrique,
            'source_url' => $url,
            'raw_text' => null,
        ]);
    }

    private function lancer(RadarListing $listing): ExtractRadarListing
    {
        $job = (new ExtractRadarListing($listing->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        return $job;
    }

    private function page(string $corps): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/annonce/*' => Http::response($corps, 200, ['Content-Type' => 'text/html; charset=utf-8']),
        ]);
    }

    // --- Le chemin nominal ---------------------------------------------------------------------

    public function test_the_fields_returned_by_the_agent_are_recorded_and_the_advertiser_attached(): void
    {
        $recu = null;
        RadarExtraction::fake(function (string $prompt) use (&$recu) {
            $recu = $prompt;

            return $this->reponseComplete();
        });
        $listing = $this->annonce();

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertNull($listing->stage_reason);
        $this->assertNotNull($listing->extracted_at);
        $this->assertSame(1, $listing->extraction_attempts);
        $this->assertSame('apartment', $listing->extracted['property_type']['value']);
        $this->assertSame('high', $listing->extracted['property_type']['confidence']);
        $this->assertSame(450000, $listing->extracted['price']['value']);
        $this->assertSame('monthly', $listing->extracted['price']['period']);
        $this->assertSame([self::NUMERO], $listing->extracted['phones']);

        // Le texte arrive au modèle délimité comme une donnée, numéro compris (classe `personnelle`).
        $this->assertStringContainsString('contenu_externe_', (string) $recu);
        $this->assertStringContainsString('77 123 45 67', (string) $recu);
        $this->assertSame(AiModelRole::Extraction, AiCall::query()->sole()->role);
        $this->assertSame($listing->id, AiCall::query()->sole()->subject_id);

        $annonceur = RadarAdvertiser::query()->sole();
        $this->assertSame($annonceur->id, $listing->radar_advertiser_id);
        $this->assertSame(self::NUMERO, $annonceur->phone);
        $this->assertSame(RadarPhone::hmac(self::NUMERO), $annonceur->phone_hmac);
        $this->assertSame('Moussa', $annonceur->display_name);
    }

    public function test_ac3_a_field_without_a_quoted_passage_is_recorded_with_the_lowest_confidence(): void
    {
        RadarExtraction::fake([$this->reponse([
            'property_type' => ['value' => 'apartment', 'confidence' => 'high', 'evidence' => null],
            'bedrooms' => ['value' => 3, 'confidence' => 'high', 'evidence' => '3 chambres'],
        ])]);
        $listing = $this->annonce();

        $this->lancer($listing);

        $extrait = $listing->refresh()->extracted;
        $this->assertSame('apartment', $extrait['property_type']['value']);
        $this->assertSame('low', $extrait['property_type']['confidence']);
        $this->assertContains('evidence_missing', $extrait['property_type']['flags']);
        $this->assertSame('high', $extrait['bedrooms']['confidence']);
    }

    public function test_without_any_phone_the_listing_is_extracted_without_an_advertiser(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $listing = $this->annonce(['raw_text' => 'Villa à vendre aux Almadies, belle vue, contact en message privé.']);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertNull($listing->radar_advertiser_id);
        $this->assertSame(0, RadarAdvertiser::query()->count());
    }

    public function test_the_phone_of_the_text_is_used_when_the_agent_returns_none(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $listing = $this->annonce();

        $this->lancer($listing);

        $this->assertSame(self::NUMERO, $listing->refresh()->advertiser->phone);
    }

    public function test_the_advertiser_is_created_once_for_two_listings_of_the_same_number_and_keeps_its_first_name(): void
    {
        RadarExtraction::fake([
            $this->reponseComplete(),
            $this->reponse([
                'advertiser_name' => ['value' => 'Agence Teranga', 'confidence' => 'high', 'evidence' => 'Agence Teranga'],
                'advertiser_nature' => ['value' => 'agency', 'confidence' => 'high', 'evidence' => 'Agence Teranga'],
                'nature_signals' => [['signal' => 'nom d\'agence', 'evidence' => 'Agence Teranga']],
                'phones' => ['+221 77 123 45 67'],
            ]),
        ]);
        $premiere = $this->annonce();
        $seconde = $this->annonce(['raw_text' => 'Agence Teranga : studio meublé à Ngor, 77 123 45 67']);

        $this->lancer($premiere);
        $this->lancer($seconde);

        $annonceur = RadarAdvertiser::query()->sole();
        $this->assertSame($annonceur->id, $premiere->refresh()->radar_advertiser_id);
        $this->assertSame($annonceur->id, $seconde->refresh()->radar_advertiser_id);
        // Le nom est posé une fois ; la nature et les indices, vides jusque-là, le sont par la seconde.
        $this->assertSame('Moussa', $annonceur->display_name);
        $this->assertSame(RadarAdvertiserNature::Agency, $annonceur->nature);
        $this->assertSame([['signal' => 'nom d\'agence', 'evidence' => 'Agence Teranga']], $annonceur->nature_signals);
    }

    // --- Captures ------------------------------------------------------------------------------

    public function test_captures_are_sent_as_stored_attachments_read_by_the_vision_role_without_a_local_path(): void
    {
        RemoteDiskFake::install();
        $listing = $this->annonce(['source_kind' => RadarSourceKind::Captures, 'raw_text' => null]);
        foreach ([1, 2] as $i) {
            $listing->addMediaFromString(base64_decode(self::PNG))
                ->usingFileName("capture-{$i}.png")
                ->withCustomProperties(['sha256' => str_repeat((string) $i, 64)])
                ->toMediaCollection('radar_captures');
        }

        $pieces = null;
        $modele = null;
        RadarExtraction::fake(function (string $prompt, Collection $attachments, $provider, string $model) use (&$pieces, &$modele) {
            // Lues ici par le disque, comme le pilote du fournisseur : sur R2, aucun chemin local.
            $pieces = $attachments->map(fn ($piece) => [$piece::class, $piece->content(), $piece->mimeType()])->all();
            $modele = $model;

            return $this->reponseComplete();
        });

        $this->lancer($listing);

        $this->assertSame('modele-v', $modele);
        $this->assertCount(2, $pieces);
        foreach ($pieces as [$classe, $octets, $type]) {
            $this->assertSame(StoredImage::class, $classe);
            $this->assertSame(base64_decode(self::PNG), $octets);
            $this->assertSame('image/png', $type);
        }
        $this->assertSame(AiModelRole::Vision, AiCall::query()->sole()->role);
        $this->assertSame(RadarListingStage::Extracted, $listing->refresh()->stage);
        $this->assertSame(self::NUMERO, $listing->advertiser->phone);
    }

    public function test_a_stop_found_after_reading_the_captures_marks_the_listing_do_not_contact_without_keeping_the_extraction(): void
    {
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);
        $listing = $this->annonce(['source_kind' => RadarSourceKind::Captures, 'raw_text' => null]);
        $listing->addMediaFromString(base64_decode(self::PNG))->usingFileName('capture-1.png')->toMediaCollection('radar_captures');
        RadarExtraction::fake([$this->reponseComplete()]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::DoNotContact, $listing->stage);
        $this->assertSame($stop->id, $listing->radar_advertiser_id);
        $this->assertNull($listing->extracted);
        // Rien de ce que l'annonce disait n'enrichit un annonceur qui a dit STOP.
        $this->assertNull($stop->refresh()->phone);
        $this->assertSame(1, RadarAdvertiser::query()->count());
    }

    public function test_a_captures_listing_without_any_capture_fails_without_calling_the_model(): void
    {
        RadarExtraction::fake();
        $listing = $this->annonce(['source_kind' => RadarSourceKind::Captures, 'raw_text' => null]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame([RadarListingStage::ExtractionFailed, 'radar.extraction.empty_source'], [$listing->stage, $listing->stage_reason]);
        RadarExtraction::assertNeverPrompted();
    }

    // --- STOP -----------------------------------------------------------------------------------

    public function test_a_number_that_said_stop_after_intake_marks_the_listing_do_not_contact_without_calling_the_model(): void
    {
        RadarExtraction::fake();
        $listing = $this->annonce();
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::DoNotContact, $listing->stage);
        $this->assertSame($stop->id, $listing->radar_advertiser_id);
        RadarExtraction::assertNeverPrompted();
        $this->assertSame(0, AiCall::query()->count());
    }

    public function test_a_stop_found_after_reading_the_url_marks_the_listing_do_not_contact_without_calling_the_model(): void
    {
        RadarExtraction::fake();
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);
        $this->page('<html><head><title>Villa Ngor</title></head><body><p>Villa à louer à Ngor. Appelez le 77 123 45 67</p></body></html>');
        $listing = $this->annonceUrl();

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::DoNotContact, $listing->stage);
        $this->assertSame($stop->id, $listing->radar_advertiser_id);
        $this->assertStringContainsString('77 123 45 67', (string) $listing->raw_text);
        RadarExtraction::assertNeverPrompted();
    }

    // --- URL ------------------------------------------------------------------------------------

    public function test_a_url_without_text_is_read_cleaned_and_extracted(): void
    {
        $recu = null;
        RadarExtraction::fake(function (string $prompt) use (&$recu) {
            $recu = $prompt;

            return $this->reponseComplete();
        });
        $this->page('<html><head><title>Appartement F4 Almadies</title><meta property="og:image" content="/photos/1.jpg"></head>'
            .'<body><script>pister()</script><p>Appartement F4 à louer aux Almadies, 450.000f/mois. Contact 77 123 45 67</p></body></html>');
        $listing = $this->annonceUrl();

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertStringContainsString('450.000f/mois', (string) $listing->raw_text);
        $this->assertStringContainsString('Appartement F4 Almadies', (string) $listing->raw_text);
        $this->assertStringNotContainsString('pister', (string) $listing->raw_text);
        $this->assertSame(['https://sn.coinafrique.com/photos/1.jpg'], $listing->photo_urls);
        $this->assertStringContainsString('source="coinafrique"', (string) $recu);
        $this->assertStringContainsString('450.000f/mois', (string) $recu);
        $this->assertSame(1, $listing->extraction_attempts);
    }

    public function test_a_refused_url_fails_with_its_code_without_calling_the_model(): void
    {
        RadarExtraction::fake();
        Http::fake();
        $listing = $this->annonceUrl('https://www.airbnb.com/rooms/42');

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertSame([RadarListingStage::ExtractionFailed, 'radar.fetch.airbnb'], [$listing->stage, $listing->stage_reason]);
        $this->assertNull($listing->raw_text);
        RadarExtraction::assertNeverPrompted();
        Http::assertNothingSent();
    }

    public function test_a_deferred_url_is_released_and_stays_pending(): void
    {
        RadarExtraction::fake(fn () => $this->reponseComplete());
        $this->page('<html><body><p>Appartement F4 à louer aux Almadies, 450.000f/mois.</p></body></html>');
        $this->lancer($this->annonceUrl('https://sn.coinafrique.com/annonce/1'));
        $seconde = $this->annonceUrl('https://sn.coinafrique.com/annonce/2');

        // Le domaine vient d'être lu : la seconde lecture attend son créneau.
        $this->lancer($seconde)->assertReleased();

        $seconde->refresh();
        $this->assertSame([RadarListingStage::Captured, 'radar.fetch.deferred'], [$seconde->stage, $seconde->stage_reason]);
        $this->assertNull($seconde->raw_text);
        RadarExtraction::assertPromptedTimes(1);
    }

    public function test_an_empty_page_fails_so_the_operator_can_paste_the_text_or_captures(): void
    {
        RadarExtraction::fake();
        $this->page('<html><body><script>app()</script></body></html>');
        $listing = $this->annonceUrl();

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame([RadarListingStage::ExtractionFailed, 'radar.extraction.empty_source'], [$listing->stage, $listing->stage_reason]);
        RadarExtraction::assertNeverPrompted();
    }

    // --- En attente, sans échec -----------------------------------------------------------------

    public function test_an_exhausted_budget_leaves_the_listing_pending_and_retries_later(): void
    {
        RadarExtraction::fake();
        config(['ai.budgets.daily_global_xof' => 0]);
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(1800);

        $listing->refresh();
        $this->assertSame([RadarListingStage::Captured, 'ai.budget'], [$listing->stage, $listing->stage_reason]);
        $this->assertNull($listing->extracted);
        RadarExtraction::assertNeverPrompted();
    }

    public function test_the_kill_switch_leaves_the_listing_pending_and_retries_later(): void
    {
        RadarExtraction::fake();
        AiUsageSetting::query()->create(['usage_key' => 'radar.extraction', 'enabled' => false]);
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(1800);

        $this->assertSame([RadarListingStage::Captured, 'ai.kill_switch'], [$listing->refresh()->stage, $listing->stage_reason]);
    }

    public function test_an_operator_who_lost_the_ability_fails_the_extraction_with_the_refusal_code(): void
    {
        RadarExtraction::fake();
        $listing = $this->annonce(['captured_by' => $this->operateur(PlatformProfileLevel::Viewer)->id]);

        $this->lancer($listing)->assertNotReleased();

        $this->assertSame([RadarListingStage::ExtractionFailed, 'ai.forbidden'], [$listing->refresh()->stage, $listing->stage_reason]);
        RadarExtraction::assertNeverPrompted();
    }

    public function test_an_outage_leaves_the_listing_pending_with_spaced_retries_then_succeeds(): void
    {
        RadarExtraction::fake(fn () => throw RateLimitedException::forProvider('anthropic'));
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(60);
        $this->assertSame([RadarListingStage::Captured, 'ai.providers_unavailable', 1], [$listing->refresh()->stage, $listing->stage_reason, $listing->extraction_attempts]);

        $this->lancer($listing)->assertReleased(300);
        $this->lancer($listing)->assertReleased(900);
        $this->lancer($listing)->assertReleased(3600);
        $this->lancer($listing)->assertReleased(3600);

        RadarExtraction::fake([$this->reponseComplete()]);
        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertSame([RadarListingStage::Extracted, null, 6], [$listing->stage, $listing->stage_reason, $listing->extraction_attempts]);
    }

    // --- Sortie invalide ------------------------------------------------------------------------

    public function test_an_invalid_output_is_retried_once_then_fails_keeping_the_source(): void
    {
        RadarExtraction::fake([['phones' => []], []]);
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(60);
        $this->assertSame([RadarListingStage::Captured, 'radar.extraction.invalid_output'], [$listing->refresh()->stage, $listing->stage_reason]);

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertSame([RadarListingStage::ExtractionFailed, 'radar.extraction.invalid_output'], [$listing->stage, $listing->stage_reason]);
        $this->assertSame(self::TEXTE, $listing->raw_text);
        $this->assertNull($listing->extracted);
        RadarExtraction::assertPromptedTimes(2);
    }

    public function test_an_invalid_output_followed_by_a_valid_one_is_extracted(): void
    {
        RadarExtraction::fake([[], $this->reponseComplete()]);
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(60);
        $this->lancer($listing)->assertNotReleased();

        $this->assertSame([RadarListingStage::Extracted, null], [$listing->refresh()->stage, $listing->stage_reason]);
    }

    // --- Idempotence, concurrence, délai --------------------------------------------------------

    public function test_a_listing_no_longer_captured_is_left_untouched(): void
    {
        RadarExtraction::fake();
        $listing = $this->annonce(['stage' => RadarListingStage::Extracted]);

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertSame([RadarListingStage::Extracted, 0], [$listing->stage, $listing->extraction_attempts]);
        RadarExtraction::assertNeverPrompted();
    }

    public function test_a_listing_moved_on_during_the_model_call_is_not_overwritten(): void
    {
        $listing = $this->annonce();
        RadarExtraction::fake(function () use ($listing) {
            // Un doublon d'exécution ou un geste de l'opérateur pendant l'appel.
            RadarListing::query()->whereKey($listing->id)->update(['stage' => RadarListingStage::Duplicate->value]);

            return $this->reponseComplete();
        });

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::Duplicate, $listing->stage);
        $this->assertNull($listing->extracted);
        $this->assertNull($listing->radar_advertiser_id);
    }

    public function test_two_runs_for_the_same_listing_never_overlap_and_the_window_is_48_hours(): void
    {
        $job = new ExtractRadarListing(42);

        $verrous = array_values(array_filter($job->middleware(), fn ($m) => $m instanceof WithoutOverlapping));
        $this->assertCount(1, $verrous);
        $this->assertSame('42', $verrous[0]->key);
        $this->assertNotNull($verrous[0]->releaseAfter);

        $this->freezeTime();
        $this->assertTrue(now()->addHours(48)->equalTo($job->retryUntil()));
        // ADR-0078 : un job de la file `database` reste sous son délai de reprise (90 s).
        $this->assertLessThanOrEqual(85, $job->timeout);
    }

    public function test_failed_marks_a_pending_listing_extraction_failed_with_its_last_reason(): void
    {
        $enAttente = $this->annonce(['stage_reason' => 'ai.budget']);
        $muet = $this->annonce();
        $extraite = $this->annonce(['stage' => RadarListingStage::Extracted]);

        (new ExtractRadarListing($enAttente->id))->failed(null);
        (new ExtractRadarListing($muet->id))->failed(null);
        (new ExtractRadarListing($extraite->id))->failed(null);

        $this->assertSame([RadarListingStage::ExtractionFailed, 'ai.budget'], [$enAttente->refresh()->stage, $enAttente->stage_reason]);
        $this->assertSame([RadarListingStage::ExtractionFailed, 'radar.extraction.timeout'], [$muet->refresh()->stage, $muet->stage_reason]);
        $this->assertSame([RadarListingStage::Extracted, null], [$extraite->refresh()->stage, $extraite->stage_reason]);
    }

    // --- De bout en bout, par l'API -------------------------------------------------------------

    public function test_ac2_pasting_the_same_text_twice_through_the_api_calls_the_model_once(): void
    {
        RadarExtraction::fake(fn () => $this->reponseComplete());
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $premier = $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])->assertCreated();
        $second = $this->postJson('/api/admin/radar/listings', ['text' => '  '.mb_strtoupper(self::TEXTE).' '])
            ->assertCreated()->assertJsonPath('data.0.existing', true);

        $this->assertSame($premier->json('data.0.id'), $second->json('data.0.id'));
        RadarExtraction::assertPromptedTimes(1);
        $this->assertSame(1, AiCall::query()->count());
        $this->assertSame(RadarListingStage::Extracted, RadarListing::query()->sole()->stage);
    }

    public function test_ac6_a_listing_for_a_number_that_said_stop_never_reaches_the_model_through_the_api(): void
    {
        RadarExtraction::fake();
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);

        $this->postJson('/api/admin/radar/listings', ['text' => self::TEXTE])
            ->assertCreated()
            ->assertJsonPath('data.0.stage', 'do_not_contact');

        RadarExtraction::assertNeverPrompted();
        $this->assertSame(0, AiCall::query()->count());
    }
}
