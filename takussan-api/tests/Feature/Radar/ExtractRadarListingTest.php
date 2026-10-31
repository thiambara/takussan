<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\Radar\FingerprintRadarSourcePhotos;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvalCaseAnonymizer;
use App\Services\Ai\Evaluation\EvalCaseExporter;
use App\Services\Ai\PromptRepository;
use App\Services\Ai\SuggestionRecorder;
use App\Services\Radar\HostResolver;
use App\Services\Radar\RadarPurger;
use App\Services\Radar\RadarReviewFields;
use App\Support\RadarPhone;
use GuzzleHttp\Psr7\Response as Psr7Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Files\StoredImage;
use Laravel\Ai\Responses\Data\FinishReason;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Ai\AgentFinDEssai;
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
            'ai.pricing.anthropic.modele-v' => ['input' => '3.0', 'output' => '15.0', 'cache_read' => '0.3', 'cache_write' => '3.75'],
        ]);
        // Le catalogue et les prompts RÉELS : c'est l'usage livré que le job appelle.
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);

        Http::preventStrayRequests();
        // Sous `sync`, le calcul des empreintes de photos partirait sur le réseau (TCK-2387).
        // TCK-2391 : un STOP lance la purge de l'annonceur ; elle s'éprouve dans RadarStopPurgeTest, ici on constate qu'elle part.
        Bus::fake([FingerprintRadarSourcePhotos::class, PurgeRadarAdvertiser::class]);
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
        // Chemin nominal : aucun STOP, donc aucune purge (TCK-2391).
        Bus::assertNotDispatched(PurgeRadarAdvertiser::class);
    }

    // --- La suggestion de l'extraction (TCK-2387, ADR-0076 §7) --------------------------------

    public function test_ac1_a_successful_extraction_records_one_suggestion(): void
    {
        RadarExtraction::fake([$this->reponseComplete()]);
        $listing = $this->annonce();

        $this->lancer($listing);

        $listing->refresh();
        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame('radar.extraction', $suggestion->usage_key);
        $this->assertSame($listing->getMorphClass(), $suggestion->subject_type);
        $this->assertSame($listing->id, $suggestion->subject_id);
        $this->assertSame(AiCall::query()->sole()->id, $suggestion->ai_call_id);
        $this->assertSame(AiSuggestionDecision::Pending, $suggestion->decision);
        $this->assertNull($suggestion->confidence);

        // La proposition est ce que l'humain décide : les valeurs normalisées, le prix en montant.
        $this->assertEquals(RadarReviewFields::values($listing->extracted), $suggestion->proposal);
        $this->assertSame(450000, $suggestion->proposal['price']);
        // Ni téléphone ni nom : ils vont à l'annonceur (ADR-0077 §9).
        $this->assertArrayNotHasKey('phones', $suggestion->proposal);
        $this->assertArrayNotHasKey('advertiser_name', $suggestion->proposal);
        $this->assertStringNotContainsString('Moussa', (string) json_encode($suggestion->proposal));
        // Le texte délimité parti au modèle : c'est l'entrée des cas d'évaluation.
        $this->assertStringContainsString('Appartement F4', (string) $suggestion->input_snapshot);
        $this->assertStringContainsString('contenu_externe_', (string) $suggestion->input_snapshot);
    }

    public function test_captures_record_a_suggestion_without_input_snapshot(): void
    {
        RemoteDiskFake::install();
        $listing = $this->annonce(['source_kind' => RadarSourceKind::Captures, 'raw_text' => null]);
        $listing->addMediaFromString(base64_decode(self::PNG))->usingFileName('capture-1.png')->toMediaCollection('radar_captures');
        RadarExtraction::fake([$this->reponseComplete()]);

        $this->lancer($listing);

        $this->assertNull(AiSuggestion::query()->sole()->input_snapshot);
    }

    public function test_no_suggestion_is_recorded_for_a_stop_a_failure_or_a_wait(): void
    {
        // STOP avant l'appel.
        RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);
        RadarExtraction::fake([$this->reponseComplete()]);
        $stop = $this->annonce();
        $this->lancer($stop);
        // Source vide : échec.
        $echec = $this->annonce(['source_kind' => RadarSourceKind::Captures, 'raw_text' => null]);
        $this->lancer($echec);
        // Plafond atteint : attente.
        config(['ai.budgets.daily_global_usd' => '0']);
        $attente = $this->annonce(['raw_text' => 'Une autre annonce sans numéro, villa à vendre']);
        $this->lancer($attente);

        // Chaque annonce est bien dans l'issue que le test prétend : l'absence de suggestion n'est pas un accident.
        $this->assertSame(RadarListingStage::DoNotContact, $stop->refresh()->stage);
        Bus::assertDispatched(PurgeRadarAdvertiser::class);
        $this->assertSame([RadarListingStage::ExtractionFailed, 'radar.extraction.empty_source'], [$echec->refresh()->stage, $echec->stage_reason]);
        $this->assertSame([RadarListingStage::Captured, 'ai.budget'], [$attente->refresh()->stage, $attente->stage_reason]);
        $this->assertSame(0, AiSuggestion::query()->count());
    }

    public function test_a_stop_found_after_the_call_records_no_suggestion(): void
    {
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac('+221781112233')]);
        RadarExtraction::fake([$this->reponse(['phones' => ['78 111 22 33']])]);

        $this->lancer($this->annonce());

        $this->assertSame(RadarListingStage::DoNotContact, RadarListing::query()->sole()->stage);

        Bus::assertDispatched(PurgeRadarAdvertiser::class);
        $this->assertSame($stop->id, RadarListing::query()->sole()->radar_advertiser_id);
        $this->assertSame(0, AiSuggestion::query()->count());
    }

    public function test_a_stop_said_under_the_lock_records_no_suggestion(): void
    {
        RadarExtraction::fake([$this->reponseComplete()]);
        $listing = $this->annonce();
        // Le STOP arrive après l'appel au modèle, quand le job relit l'annonceur sous verrou.
        $fait = false;
        RadarAdvertiser::retrieved(function (RadarAdvertiser $annonceur) use (&$fait): void {
            if (! $fait) {
                $fait = true;
                RadarAdvertiser::query()->whereKey($annonceur->id)->update(['do_not_contact_at' => now()]);
            }
        });

        $this->lancer($listing);

        $this->assertSame(RadarListingStage::DoNotContact, $listing->refresh()->stage);

        Bus::assertDispatched(PurgeRadarAdvertiser::class);
        $this->assertSame(1, AiCall::query()->count(), 'Le modèle a bien été appelé : seule la suggestion est écartée.');
        $this->assertSame(0, AiSuggestion::query()->count());
        Bus::assertNotDispatched(FingerprintRadarSourcePhotos::class);
    }

    public function test_the_stored_snapshot_is_the_sent_input_anonymized_with_the_extracted_name_and_phones(): void
    {
        $texte = 'Appartement F4 à louer aux Almadies, 450.000f/mois. Contactez Moussa Diop au 77 123 45 67';
        $recu = null;
        RadarExtraction::fake(function (string $prompt) use (&$recu) {
            $recu = $prompt;

            return $this->reponse([
                'property_type' => ['value' => 'apartment', 'confidence' => 'high', 'evidence' => 'Appartement F4'],
                'advertiser_name' => ['value' => 'Moussa Diop', 'confidence' => 'medium', 'evidence' => 'Moussa Diop'],
                'phones' => ['77 123 45 67', '78 999 88 77'],
            ]);
        });
        $listing = $this->annonce(['raw_text' => $texte]);

        $this->lancer($listing);

        $snapshot = (string) AiSuggestion::query()->sole()->input_snapshot;
        $this->assertStringContainsString('Moussa', (string) $recu, 'Le modèle a bien reçu le nom.');
        foreach (['Moussa', 'Diop', '123 45 67'] as $fuite) {
            $this->assertStringNotContainsString($fuite, $snapshot);
        }
        $this->assertStringContainsString('[NOM]', $snapshot);
        $this->assertStringContainsString('[TELEPHONE]', $snapshot);
        // Le reste est l'entrée envoyée, octet pour octet : délimiteur et étiquette compris.
        $this->assertSame(
            str_replace(['Moussa Diop', '77 123 45 67'], ['[NOM]', '[TELEPHONE]'], (string) $recu),
            $snapshot,
        );
    }

    public function test_an_edited_radar_suggestion_is_exported_without_the_advertiser_name(): void
    {
        RadarExtraction::fake([$this->reponse([
            'property_type' => ['value' => 'apartment', 'confidence' => 'high', 'evidence' => 'Appartement F4'],
            'contract' => ['value' => 'rent', 'confidence' => 'high', 'evidence' => 'à louer'],
            'price' => ['value' => '450.000f/mois', 'confidence' => 'high', 'evidence' => '450.000f/mois'],
            'advertiser_name' => ['value' => 'Moussa Diop', 'confidence' => 'medium', 'evidence' => 'Moussa Diop'],
            'phones' => ['77 123 45 67'],
        ])]);
        $listing = $this->annonce(['raw_text' => 'Appartement F4 à louer aux Almadies, 450.000f/mois. Contactez Moussa Diop au 77 123 45 67']);
        $this->lancer($listing);
        $suggestion = AiSuggestion::query()->sole();
        // L'opérateur corrige le prix : la suggestion devient `edited`, donc un cas d'évaluation.
        app(SuggestionRecorder::class)->edit($suggestion, [...$suggestion->proposal, 'price' => 500000], $this->operateur);

        $racine = storage_path('framework/testing/radar-export-'.bin2hex(random_bytes(4)));
        try {
            $fichiers = (new EvalCaseExporter(new EvalCaseAnonymizer, $racine))->export('radar.extraction');

            $this->assertCount(1, $fichiers);
            $brut = (string) file_get_contents($fichiers[0]);
            foreach (['Moussa', 'Diop', '123 45 67'] as $fuite) {
                $this->assertStringNotContainsString($fuite, $brut);
            }
            $cas = json_decode($brut, true);
            $this->assertStringContainsString('Appartement F4', $cas['input']);
            $this->assertSame(500000, $cas['expected']['price']);
        } finally {
            File::deleteDirectory($racine);
        }
    }

    public function test_a_second_extraction_leaves_only_one_pending_suggestion(): void
    {
        RadarExtraction::fake([$this->reponseComplete(), $this->reponseComplete()]);
        $listing = $this->annonce();
        $this->lancer($listing);
        $premiere = AiSuggestion::query()->sole();

        // Relance (TCK-2392) : l'annonce est remise en attente d'extraction.
        $listing->refresh()->forceFill(['stage' => RadarListingStage::Captured, 'extracted' => null])->save();
        $this->lancer($listing);

        $suggestion = AiSuggestion::query()->sole();
        $this->assertNotSame($premiere->id, $suggestion->id);
        $this->assertSame(AiSuggestionDecision::Pending, $suggestion->decision);
        // L'appel de la première reste : son coût et sa trace ne se perdent pas.
        $this->assertSame(2, AiCall::query()->count());
    }

    public function test_a_second_extraction_keeps_a_decided_suggestion(): void
    {
        RadarExtraction::fake([$this->reponseComplete()]);
        $listing = $this->annonce();
        $this->lancer($listing);
        app(SuggestionRecorder::class)->accept(AiSuggestion::query()->sole(), $this->operateur);

        $listing->refresh()->forceFill(['stage' => RadarListingStage::Captured, 'extracted' => null])->save();
        RadarExtraction::fake([$this->reponseComplete()]);
        $this->lancer($listing);

        // La décision d'un humain ne s'efface pas : une décidée + une nouvelle en attente.
        $this->assertSame(
            [AiSuggestionDecision::Accepted->value, AiSuggestionDecision::Pending->value],
            AiSuggestion::query()->orderBy('id')->get()->map(fn ($x) => $x->decision->value)->all(),
        );
    }

    public function test_the_photo_fingerprints_are_queued_for_a_url_listing_with_photos_only(): void
    {
        RadarExtraction::fake([$this->reponseComplete(), $this->reponseComplete(), $this->reponseComplete()]);
        $avecPhotos = $this->annonce(['source_kind' => RadarSourceKind::Url, 'source_site' => RadarSourceSite::Coinafrique, 'photo_urls' => ['https://sn.coinafrique.com/photos/1.jpg']]);
        $sansPhotos = $this->annonce(['raw_text' => 'Villa à vendre, 3 chambres, 77 123 45 67']);

        $this->lancer($avecPhotos);
        $this->lancer($sansPhotos);

        Bus::assertDispatchedTimes(FingerprintRadarSourcePhotos::class, 1);
        Bus::assertDispatched(FingerprintRadarSourcePhotos::class, fn ($job) => $job->listingId === $avecPhotos->id);
    }

    public function test_the_photo_fingerprints_are_not_queued_for_a_listing_that_did_not_reach_extracted(): void
    {
        RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);
        RadarExtraction::fake([$this->reponseComplete()]);

        $this->lancer($this->annonce(['source_kind' => RadarSourceKind::Url, 'photo_urls' => ['https://sn.coinafrique.com/photos/1.jpg']]));

        Bus::assertNotDispatched(FingerprintRadarSourcePhotos::class);
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

    public function test_tck_2412_a_list_the_masker_reads_as_a_phone_creates_no_advertiser(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $listing = $this->annonce(['raw_text' => 'Villa à vendre aux Almadies. Horaires de visite 30 20 5 20 10 min, contact en message privé.']);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertNull($listing->radar_advertiser_id);
        $this->assertSame(0, RadarAdvertiser::query()->count());
    }

    /** @return array<string, array{string}> */
    public static function plusEntreDeuxNumeros(): array
    {
        return [
            'plus entre deux numéros' => ['Villa F4 aux Almadies. Contact : 78 765 43 21 + 77 123 45 67'],
            'plus collé au second' => ['Villa F4 aux Almadies. Tel 78 765 43 21 +77 123 45 67'],
            'plus derrière un mot' => ['Villa F4 aux Almadies. WhatsApp + 77 123 45 67'],
        ];
    }

    /** Contre-vérification C1 — le numéro qui a dit STOP, derrière un `+`, arrête l'annonce avant tout appel au modèle. */
    #[DataProvider('plusEntreDeuxNumeros')]
    public function test_tck_2412_a_stop_behind_a_plus_is_refused_without_calling_the_model(string $texte): void
    {
        RadarExtraction::fake();
        $listing = $this->annonce(['raw_text' => $texte]);
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);

        $this->lancer($listing);

        $this->assertSame(RadarListingStage::DoNotContact, $listing->refresh()->stage);
        $this->assertSame($stop->id, $listing->radar_advertiser_id);
        RadarExtraction::assertNeverPrompted();
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

    // --- Revue finale : l'annonceur ne vient que de la source -----------------------------------

    public function test_f1_a_phone_only_the_model_returned_neither_creates_nor_attaches_an_advertiser(): void
    {
        RadarExtraction::fake([$this->reponse(['phones' => ['77 123 45 67']])]);
        $listing = $this->annonce(['raw_text' => 'Villa à vendre aux Almadies, belle vue, contact en message privé.']);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertNull($listing->radar_advertiser_id);
        $this->assertSame(0, RadarAdvertiser::query()->count());
        $this->assertSame([], $listing->extracted['phones']);
        $this->assertSame(['evidence_not_in_source'], $listing->extracted['phones_flags']);
    }

    public function test_f1_the_number_of_the_source_comes_before_one_the_model_misread(): void
    {
        // Le modèle a mal lu un chiffre, et rend son numéro en premier : la source l'emporte.
        RadarExtraction::fake([$this->reponse(['phones' => ['77 123 45 68', '77 123 45 67']])]);
        $listing = $this->annonce();

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(self::NUMERO, RadarAdvertiser::query()->sole()->phone);
        $this->assertSame(self::NUMERO, $listing->advertiser->phone);
        $this->assertSame([self::NUMERO], $listing->extracted['phones']);
    }

    public function test_f1_the_advertiser_follows_the_model_order_among_the_numbers_of_the_source(): void
    {
        // Décision du porteur (2026-10-27) : parmi les numéros présents dans la source, le choix du
        // contact principal revient au modèle — un numéro de barre latérale placé plus haut ne l'emporte pas.
        RadarExtraction::fake([$this->reponse(['phones' => ['77 123 45 67', '78 765 43 21']])]);
        $listing = $this->annonce(['raw_text' => 'Studio à Ngor. Moussa 78 765 43 21, ou son frère 77 123 45 67.']);

        $this->lancer($listing);

        $this->assertSame('+221771234567', $listing->refresh()->advertiser->phone);
    }

    public function test_f1_without_a_kept_model_number_the_advertiser_is_the_first_number_of_the_source(): void
    {
        RadarExtraction::fake([$this->reponse(['phones' => []])]);
        $listing = $this->annonce(['raw_text' => 'Studio à Ngor. Moussa 78 765 43 21, ou son frère 77 123 45 67.']);

        $this->lancer($listing);

        $this->assertSame('+221787654321', $listing->refresh()->advertiser->phone);
    }

    public function test_f1_a_number_of_the_source_written_differently_by_the_model_is_kept(): void
    {
        RadarExtraction::fake([$this->reponse(['phones' => ['+221771234567']])]);
        $listing = $this->annonce(['raw_text' => 'Studio meublé à Ngor, appelez le 77 123 45 67 ou passez.']);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame([self::NUMERO], $listing->extracted['phones']);
        $this->assertSame([], $listing->extracted['phones_flags']);
        $this->assertSame(self::NUMERO, $listing->advertiser->phone);
    }

    public function test_f1_a_stop_on_a_number_only_the_model_returned_still_marks_the_listing_do_not_contact(): void
    {
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac('+221781112233')]);
        RadarExtraction::fake([$this->reponse(['phones' => ['78 111 22 33']])]);
        $listing = $this->annonce(['raw_text' => 'Villa à vendre aux Almadies, belle vue, contact en message privé.']);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::DoNotContact, $listing->stage);
        Bus::assertDispatched(PurgeRadarAdvertiser::class);
        $this->assertSame($stop->id, $listing->radar_advertiser_id);
        $this->assertNull($listing->extracted);
    }

    public function test_f3_flagged_advertiser_fields_do_not_enrich_the_advertiser(): void
    {
        RadarExtraction::fake([$this->reponse([
            // Un nom dont le passage n'est pas dans le texte, une nature sans passage.
            'advertiser_name' => ['value' => 'Agence Teranga', 'confidence' => 'high', 'evidence' => 'Agence Teranga'],
            'advertiser_nature' => ['value' => 'agency', 'confidence' => 'high', 'evidence' => null],
            'phones' => ['77 123 45 67'],
        ])]);
        $listing = $this->annonce();

        $this->lancer($listing);

        $this->assertSame(RadarListingStage::Extracted, $listing->refresh()->stage);
        $annonceur = RadarAdvertiser::query()->sole();
        $this->assertNull($annonceur->display_name);
        $this->assertSame(RadarAdvertiserNature::Unknown, $annonceur->nature);
    }

    public function test_f4_a_listing_moved_on_during_the_model_call_creates_no_advertiser(): void
    {
        $listing = $this->annonce();
        RadarExtraction::fake(function () use ($listing) {
            RadarListing::query()->whereKey($listing->id)->update(['stage' => RadarListingStage::Refused->value]);

            return $this->reponseComplete();
        });

        $this->lancer($listing);

        $this->assertSame(RadarListingStage::Refused, $listing->refresh()->stage);
        $this->assertSame(0, RadarAdvertiser::query()->count());
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
        Bus::assertDispatched(PurgeRadarAdvertiser::class);
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
        Bus::assertDispatched(PurgeRadarAdvertiser::class, fn (PurgeRadarAdvertiser $job) => $job->advertiserId === $stop->id);
        $this->assertSame($stop->id, $listing->radar_advertiser_id);
        RadarExtraction::assertNeverPrompted();
        $this->assertSame(0, AiCall::query()->count());

        // TCK-2391 : le job mis en file efface la matière de l'annonce, sans attendre `radar:purge`.
        Bus::dispatched(PurgeRadarAdvertiser::class)->first()->handle(app(RadarPurger::class));
        $this->assertSame(RadarListingStage::Purged, $listing->fresh()->stage);
        $this->assertNull($listing->fresh()->raw_text);
    }

    public function test_une_purge_entre_la_recherche_et_le_verrou_de_l_annonceur_ne_lui_prend_pas_son_numero(): void
    {
        RadarExtraction::fake([$this->reponseComplete()]);
        // Un annonceur déjà purgé sans refus : ses annonces et son numéro sont partis, mais il garde un message.
        $annonceur = RadarAdvertiser::factory()->create(['phone' => null, 'phone_hmac' => RadarPhone::hmac(self::NUMERO)]);
        RadarOutreach::factory()->create(['radar_advertiser_id' => $annonceur->id, 'salutation' => '', 'summary' => '', 'message' => '']);
        $listing = $this->annonce();
        // `findOrCreate()` lui rend son numéro ; une purge passe alors, avant que le job ne prenne le verrou : elle ne voit pas
        // encore l'annonce rattachée à personne, et efface le numéro.
        $faite = false;
        RadarAdvertiser::updated(function (RadarAdvertiser $a) use (&$faite): void {
            if (! $faite) {
                $faite = true;
                app(RadarPurger::class)->run($a->id);
            }
        });

        $this->lancer($listing);

        $this->assertTrue($faite, 'La purge devait passer entre la recherche et le verrou.');
        $this->assertSame(RadarListingStage::Extracted, $listing->fresh()->stage);
        $this->assertSame($annonceur->id, $listing->fresh()->radar_advertiser_id);
        $this->assertSame(self::NUMERO, $annonceur->fresh()->phone);
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
        Bus::assertDispatched(PurgeRadarAdvertiser::class);
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

        // Premier passage : la page seule, gardée ; l'appel au modèle aura son propre passage, et son
        // propre délai (la lecture et l'appel ne se partagent jamais le `$timeout` du job).
        $this->lancer($listing)->assertReleased(0);
        RadarExtraction::assertNeverPrompted();
        $this->assertSame([RadarListingStage::Captured, 0], [$listing->refresh()->stage, $listing->extraction_attempts]);
        $this->assertStringContainsString('450.000f/mois', (string) $listing->raw_text);
        Http::assertSentCount(2);

        // Second passage : l'appel, sans relire la page.
        $this->lancer($listing)->assertNotReleased();
        Http::assertSentCount(2);

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
        $this->assertSame(0, $listing->extraction_attempts);
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
        $this->assertSame(0, $seconde->extraction_attempts);
        RadarExtraction::assertNeverPrompted();
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
        config(['ai.budgets.daily_global_usd' => '0']);
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(1800);

        $listing->refresh();
        $this->assertSame([RadarListingStage::Captured, 'ai.budget'], [$listing->stage, $listing->stage_reason]);
        $this->assertNull($listing->extracted);
        // Une pause n'atteint pas le fournisseur : elle n'est pas une tentative.
        $this->assertSame(0, $listing->extraction_attempts);
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
        // TCK-2433 — une sortie vide (`[]`) n'arrive plus au job : la passerelle en fait un échec du maillon
        // (`ai.response_invalid`, épreuve dans `StructuredOutputModeTest`). L'invalide ici est une sortie incomplète.
        RadarExtraction::fake([['phones' => []], ['phones' => []]]);
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
        RadarExtraction::fake([['phones' => []], $this->reponseComplete()]);
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
        // Le doublon est relâché, jamais jeté ; et le verrou survit au délai de reprise de la file
        // (90 s) : un job relivré pendant que le premier tourne encore ne passe pas.
        $this->assertSame(30, $verrous[0]->releaseAfter);
        $this->assertGreaterThanOrEqual((int) config('queue.connections.database.retry_after'), $verrous[0]->expiresAfter);
        $this->assertGreaterThanOrEqual(90, $verrous[0]->expiresAfter);

        $this->freezeTime();
        $this->assertTrue(now()->addHours(48)->equalTo($job->retryUntil()));
        // ADR-0078 : un job de la file `database` reste sous son délai de reprise (90 s).
        $this->assertLessThanOrEqual(85, $job->timeout);
        // Un délai dépassé n'est pas terminal : seule la fenêtre de 48 h l'est.
        $this->assertNull($job->maxExceptions ?? null);
    }

    public function test_every_link_of_the_chain_in_play_fits_in_the_job_timeout_with_the_sdk_retry_reserved(): void
    {
        $job = new ExtractRadarListing(1);

        // Pour chaque longueur que la console admet (1 à 5, UpdateAiRoleRequest) : chaque maillon, son
        // délai plus la nouvelle tentative du SDK (attente ≤ 10 s sur un 429/5xx à Retry-After court).
        foreach (range(1, 5) as $maillons) {
            $delai = (new RadarExtraction)->configure('', null, $maillons)->timeout();
            $this->assertGreaterThanOrEqual(5, $delai);
            $this->assertLessThanOrEqual(ExtractRadarListing::AI_CALL_BUDGET_SECONDS, ($delai + 10) * $maillons, "{$maillons} maillons");
        }
        $this->assertLessThan($job->timeout, ExtractRadarListing::AI_CALL_BUDGET_SECONDS);
        $this->assertSame([65, 27], [
            (new RadarExtraction)->configure('', null, 1)->timeout(),
            (new RadarExtraction)->configure('', null, 2)->timeout(),
        ]);

        // Jamais au-delà du délai configuré du socle.
        config(['ai.timeout_seconds' => 7]);
        $this->assertSame(7, (new RadarExtraction)->configure('', null, 1)->timeout());
    }

    /** L'agent que la passerelle a configuré pour l'appel, relevé à sa résolution. */
    private function agentDeLAppel(RadarListing $listing): RadarExtraction
    {
        $agents = [];
        $this->app->afterResolving(RadarExtraction::class, function (RadarExtraction $agent) use (&$agents): void {
            $agents[] = $agent;
        });
        RadarExtraction::fake(fn () => $this->reponseComplete());

        $this->lancer($listing);

        $this->assertCount(1, $agents);

        return $agents[0];
    }

    public function test_the_call_timeout_follows_the_length_of_the_chain_actually_played(): void
    {
        // Le texte : la chaîne `extraction` d'essai, deux maillons.
        $this->assertSame(27, $this->agentDeLAppel($this->annonce())->timeout());
    }

    public function test_captures_play_the_single_link_vision_chain_with_its_whole_budget(): void
    {
        $listing = $this->annonce(['source_kind' => RadarSourceKind::Captures, 'raw_text' => null]);
        $listing->addMediaFromString(base64_decode(self::PNG))->usingFileName('capture-1.png')->toMediaCollection('radar_captures');

        $this->assertSame(65, $this->agentDeLAppel($listing)->timeout());
    }

    public function test_a_forced_model_is_a_single_link_chain(): void
    {
        AiUsageSetting::query()->create(['usage_key' => 'radar.extraction', 'enabled' => true, 'forced_provider' => 'anthropic', 'forced_model' => 'modele-b']);

        $this->assertSame(65, $this->agentDeLAppel($this->annonce())->timeout());
    }

    public function test_a_stop_on_any_phone_of_the_output_marks_the_listing_do_not_contact(): void
    {
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac('+221781112233')]);
        $listing = $this->annonce(['source_kind' => RadarSourceKind::Captures, 'raw_text' => null]);
        $listing->addMediaFromString(base64_decode(self::PNG))->usingFileName('capture-1.png')->toMediaCollection('radar_captures');
        RadarExtraction::fake([$this->reponse([
            'advertiser_name' => ['value' => 'Moussa', 'confidence' => 'medium', 'evidence' => 'Moussa'],
            'phones' => ['77 123 45 67', '78 111 22 33'],
        ])]);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::DoNotContact, $listing->stage);
        Bus::assertDispatched(PurgeRadarAdvertiser::class);
        $this->assertSame($stop->id, $listing->radar_advertiser_id);
        $this->assertNull($listing->extracted);
        // Le premier numéro n'est ni créé ni enrichi.
        $this->assertSame(1, RadarAdvertiser::query()->count());
    }

    public function test_a_stop_said_between_the_lookup_and_the_write_is_honoured_under_lock(): void
    {
        RadarExtraction::fake([$this->reponseComplete()]);
        $listing = $this->annonce();
        // Le STOP arrive juste après que le job a relu l'annonceur (fenêtre lecture → écriture).
        $fait = false;
        RadarAdvertiser::retrieved(function (RadarAdvertiser $annonceur) use (&$fait): void {
            if (! $fait) {
                $fait = true;
                RadarAdvertiser::query()->whereKey($annonceur->id)->update(['do_not_contact_at' => now()]);
            }
        });

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::DoNotContact, $listing->stage);
        Bus::assertDispatched(PurgeRadarAdvertiser::class);
        $this->assertNull($listing->extracted);
        $this->assertNull(RadarAdvertiser::query()->sole()->display_name);
    }

    /** @return array<string, array{\Closure(): never, string}> */
    public static function deterministicErrors(): array
    {
        return [
            'requête refusée (400)' => [fn () => throw new RequestException(new Response(new Psr7Response(400))), 'ai.request_rejected'],
            'clé refusée (401)' => [fn () => throw new RequestException(new Response(new Psr7Response(401))), 'ai.provider_auth'],
            'erreur de programmation' => [fn () => throw new \TypeError('boum'), 'radar.extraction.error'],
        ];
    }

    #[DataProvider('deterministicErrors')]
    public function test_a_deterministic_error_fails_the_extraction_without_retrying(\Closure $erreur, string $code): void
    {
        RadarExtraction::fake($erreur);
        $listing = $this->annonce();

        $this->lancer($listing)->assertNotReleased();

        $this->assertSame([RadarListingStage::ExtractionFailed, $code], [$listing->refresh()->stage, $listing->stage_reason]);
    }

    /** @return array<string, array{\Closure(): never, string}> */
    public static function transientErrors(): array
    {
        return [
            'indisponible (503 brut)' => [fn () => throw new RequestException(new Response(new Psr7Response(503))), 'ai.provider_unavailable'],
            // Un imprévu qui n'est pas une erreur de programmation (lecture R2, base) : il passe.
            'imprévu passager' => [fn () => throw new \RuntimeException('Unable to read file'), 'ai.unexpected'],
        ];
    }

    #[DataProvider('transientErrors')]
    public function test_a_transient_non_failover_error_leaves_the_listing_pending(\Closure $erreur, string $code): void
    {
        RadarExtraction::fake($erreur);
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(60);
        $this->lancer($listing)->assertReleased(300);

        $this->assertSame([RadarListingStage::Captured, $code], [$listing->refresh()->stage, $listing->stage_reason]);
    }

    public function test_an_unreadable_response_is_retried_once_then_fails(): void
    {
        RadarExtraction::fake(fn () => throw new \JsonException('Syntax error'));
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(60);
        $this->assertSame([RadarListingStage::Captured, 'ai.response_invalid'], [$listing->refresh()->stage, $listing->stage_reason]);

        $this->lancer($listing)->assertNotReleased();
        $this->assertSame([RadarListingStage::ExtractionFailed, 'ai.response_invalid'], [$listing->refresh()->stage, $listing->stage_reason]);
    }

    /** TCK-2433 — une réponse sans sortie (l'outil de sortie n'est plus forcé) bascule, puis se retente une fois. */
    public function test_a_response_without_output_fails_over_then_is_retried_once(): void
    {
        RadarExtraction::fake([[], [], [], []]);
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(60);
        $this->assertSame([RadarListingStage::Captured, 'ai.response_invalid'], [$listing->refresh()->stage, $listing->stage_reason]);

        $this->lancer($listing)->assertNotReleased();
        $this->assertSame([RadarListingStage::ExtractionFailed, 'ai.response_invalid'], [$listing->refresh()->stage, $listing->stage_reason]);
        RadarExtraction::assertPromptedTimes(4);
    }

    public function test_a_truncated_response_is_retried_once_then_fails(): void
    {
        $this->app->bind(RadarExtraction::class, fn () => new AgentFinDEssai(['modele-a' => FinishReason::Length, 'modele-b' => FinishReason::Length]));
        $listing = $this->annonce();

        $this->lancer($listing)->assertReleased(60);
        $this->assertSame([RadarListingStage::Captured, 'ai.response_truncated'], [$listing->refresh()->stage, $listing->stage_reason]);

        $this->lancer($listing)->assertNotReleased();
        $this->assertSame([RadarListingStage::ExtractionFailed, 'ai.response_truncated'], [$listing->refresh()->stage, $listing->stage_reason]);
        $this->assertSame(self::TEXTE, $listing->raw_text);
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
