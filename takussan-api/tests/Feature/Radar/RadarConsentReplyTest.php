<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarConsentVerification;
use App\Exceptions\ApiError;
use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\RadarConsentWorkflow;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Files\StoredImage;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2388 (ADR-0077 §3, AC3) — déposer la réponse d'un annonceur (des captures) et la faire vérifier par l'IA. Le dépôt
 * range les captures aux règles de la saisie (EXIF retiré, SHA-256 de l'original) et met la vérification en file APRÈS
 * le commit ; le job écrit un verdict, JAMAIS une confirmation, et ne déplace aucune annonce. Aucun modèle réel :
 * `RadarConsentVerification::fake()`.
 */
class RadarConsentReplyTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private const NUMERO = '+221771234567';

    private User $operateur;

    private RadarAdvertiser $annonceur;

    private RadarListing $annonce;

    private RadarOutreach $message;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-28 10:00:00');
        $this->installerSocleDEssai();
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.roles.raisonnement' => [['provider' => 'anthropic', 'model' => 'modele-r', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
            'ai.pricing.anthropic.modele-r' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
            'app.frontend_url' => 'https://front.exemple.test',
        ]);
        // Le catalogue et les prompts RÉELS : c'est l'usage livré que le job appelle.
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);

        $this->operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Fall']);
        $this->annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Contacted]);
        $texte = $this->app->make(ConsentMessageComposer::class)->compose('fr', 'Bonjour Awa,', 'votre appartement à Ouakam', 'accord.v1');
        $this->message = RadarOutreach::factory()->withListings($this->annonce)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'salutation' => 'Bonjour Awa,', 'summary' => 'votre appartement à Ouakam',
            'message' => $texte, 'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Une sortie complète du modèle : un « oui » concordant, sauf ce qui est surchargé. @param  array<string, mixed>  $surcharge */
    private function sortie(array $surcharge = []): array
    {
        return $surcharge + [
            'transcript' => "Takussan : Bonjour Awa, ...\nAnnonceur : OUI",
            'reply_text' => 'OUI',
            'counterpart_phone' => '77 123 45 67',
            'counterpart_name' => 'Awa Fall',
            'number_matches' => true,
            'name_matches' => true,
            'clauses_found' => [1, 2, 3, 4],
            'classification' => 'consent',
            'confidence' => 'high',
        ];
    }

    private function png(string $nom = 'a.png'): UploadedFile
    {
        return UploadedFile::fake()->image($nom, 40, 40);
    }

    /** @param  list<UploadedFile>  $captures */
    private function deposer(array $captures, ?RadarOutreach $message = null): TestResponse
    {
        return $this->post('/api/admin/radar/outreaches/'.($message ?? $this->message)->id.'/reply', ['captures' => $captures], ['Accept' => 'application/json']);
    }

    private function reponseDeposee(): RadarConsent
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        // Un message n'accepte qu'une réponse en attente de vérification : celles que les tests ont déjà déposées sur lui
        // sont réglées d'office, pour qu'on puisse en déposer d'autres.
        RadarConsent::query()->where('verification_status', RadarVerificationStatus::Pending->value)
            ->update(['verification_status' => RadarVerificationStatus::Failed->value, 'verification_reason' => 'radar.verification.timeout']);
        $id = $this->deposer([$this->png()])->assertCreated()->json('data.id');

        return RadarConsent::query()->findOrFail($id);
    }

    private function lancer(RadarConsent $reponse): VerifyRadarConsentReply
    {
        $job = (new VerifyRadarConsentReply($reponse->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        return $job;
    }

    /** @return array<string, mixed> */
    private function etat(): array
    {
        return [
            RadarConsent::query()->orderBy('id')->get()->map->getAttributes()->all(),
            DB::table('media')->count(),
            AiSuggestion::query()->count(),
            RadarListing::query()->orderBy('id')->pluck('stage', 'id')->map(fn ($s) => $s instanceof \BackedEnum ? $s->value : $s)->all(),
        ];
    }

    // --- Le dépôt ----------------------------------------------------------------------------------

    public function test_deposer_deux_captures_les_range_avec_le_sha256_des_originaux_et_met_la_verification_en_file_une_fois(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        RadarConsentVerification::fake();
        $a = UploadedFile::fake()->image('a.png', 40, 40);
        $b = UploadedFile::fake()->image('b.png', 30, 50);
        $hashes = [hash('sha256', (string) file_get_contents($a->getRealPath())), hash('sha256', (string) file_get_contents($b->getRealPath()))];

        $reponse = $this->deposer([$a, $b])->assertCreated()
            ->assertJsonPath('data.verification_status', 'pending')
            ->assertJsonPath('data.proof', 'screenshot')
            ->assertJsonPath('data.verdict', null)
            ->assertJsonCount(2, 'data.captures');

        $consent = RadarConsent::query()->sole();
        $this->assertSame($consent->id, $reponse->json('data.id'));
        $this->assertSame($hashes, $consent->capture_hashes);
        $this->assertSame($this->message->id, $consent->radar_outreach_id);
        $this->assertSame($this->annonceur->id, $consent->radar_advertiser_id);
        $this->assertSame($this->operateur->id, $consent->deposited_by_id);
        $this->assertSame(RadarVerificationStatus::Pending, $consent->verification_status);
        $medias = $consent->getMedia('radar_consent_captures');
        $this->assertCount(2, $medias);
        foreach ($medias as $i => $media) {
            $this->assertSame($hashes[$i], $media->getCustomProperty('sha256'));
            $this->assertSame(config('media-library.disk_name'), $media->disk);
            $this->assertNotSame(config('media-library.public_disk_name'), $media->disk);
        }
        // La vérification part en file UNE fois, après le commit ; le dépôt n'appelle jamais le modèle.
        Bus::assertDispatchedTimes(VerifyRadarConsentReply::class, 1);
        Bus::assertDispatched(VerifyRadarConsentReply::class, fn (VerifyRadarConsentReply $job) => $job->replyId === $consent->id);
        RadarConsentVerification::assertNeverPrompted();
        $this->assertSame(0, AiCall::query()->count());
        // Déposer ne confirme rien et ne déplace aucune annonce.
        $this->assertNull($consent->confirmed_at);
        $this->assertSame(RadarListingStage::Contacted, $this->annonce->fresh()->stage);
    }

    public function test_la_verification_ne_part_pas_si_le_depot_est_annule(): void
    {
        // File synchrone : sans `afterCommit()`, le job s'exécuterait AU MOMENT de la mise en file, dans la transaction.
        RadarConsentVerification::fake();
        // Le journal échoue APRÈS la mise en file : la transaction rend les lignes, et le job ne doit pas partir.
        \App\Models\Activity::creating(fn () => throw new \RuntimeException('journal indisponible'));
        $this->withoutExceptionHandling();
        $avant = $this->etat();

        try {
            $this->deposer([$this->png()]);
            $this->fail('Le dépôt aurait dû échouer.');
        } catch (\RuntimeException $e) {
            $this->assertSame('journal indisponible', $e->getMessage());
        } finally {
            \App\Models\Activity::flushEventListeners();
        }

        $this->assertSame($avant, $this->etat());
        // La transaction rend les lignes, jamais les fichiers : aucune capture orpheline ne doit rester sur le disque privé.
        $this->assertSame([], Storage::disk(config('media-library.disk_name'))->allFiles());
        RadarConsentVerification::assertNeverPrompted();
        $this->assertSame(0, AiCall::query()->count());
    }

    public function test_un_second_depot_est_refuse_tant_que_la_premiere_reponse_attend_sa_verification(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $this->deposer([$this->png()])->assertCreated();
        $avant = $this->etat();

        $this->deposer([$this->png('b.png')])->assertStatus(409)->assertJsonPath('code', 'radar.outreach.reply_pending');

        $this->assertSame($avant, $this->etat());
        Bus::assertDispatchedTimes(VerifyRadarConsentReply::class, 1);
        $this->assertCount(1, Storage::disk(config('media-library.disk_name'))->allFiles());

        // Une fois la vérification réglée (réussie ou non), un nouveau dépôt redevient possible.
        RadarConsent::query()->sole()->forceFill(['verification_status' => RadarVerificationStatus::Failed])->save();
        $this->deposer([$this->png('c.png')])->assertCreated();
        $this->assertSame(2, RadarConsent::query()->count());
    }

    public function test_le_journal_nomme_le_depot_sans_texte_ni_numero(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $id = $this->deposer([$this->png(), $this->png('b.png')])->assertCreated()->json('data.id');

        $ligne = Activity::query()->where('event', 'radar_consent_reply_deposited')->sole();
        $this->assertEquals(['outreach_id' => $this->message->id, 'consent_id' => $id, 'captures' => 2], $ligne->properties->all());
        $this->assertSame($this->operateur->id, $ligne->causer_id);
        $this->assertStringNotContainsString('771234567', $ligne->toJson());
    }

    public function test_une_capture_jpeg_perd_son_exif_au_rangement(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $original = $this->jpegAvecExif();
        $this->assertSame('TakussanCam', $this->exif($original)['Make'] ?? null, 'le témoin doit porter un EXIF lisible');
        $this->assertArrayHasKey('GPSLatitude', $this->exif($original), 'le témoin doit porter une position GPS lisible');

        $this->deposer([UploadedFile::fake()->createWithContent('reponse.jpg', $original)])->assertCreated();

        $media = RadarConsent::query()->sole()->getFirstMedia('radar_consent_captures');
        $stocke = (string) stream_get_contents($media->stream());
        $this->assertNotSame('', $stocke);
        $this->assertStringNotContainsString("Exif\x00\x00", $stocke);
        $this->assertArrayNotHasKey('Make', $this->exif($stocke));
        $this->assertArrayNotHasKey('GPSLatitude', $this->exif($stocke));
        // Le SHA-256 gardé est celui de l'ORIGINAL.
        $this->assertSame(hash('sha256', $original), $media->getCustomProperty('sha256'));
        $this->assertSame([hash('sha256', $original)], RadarConsent::query()->sole()->capture_hashes);
    }

    public function test_une_image_demesuree_ou_un_pdf_sont_refuses_sans_rien_ecrire(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $avant = $this->etat();

        $this->deposer([UploadedFile::fake()->createWithContent('grande.png', $this->pngDeDimensions(20_001, 1))])
            ->assertStatus(422)->assertJsonPath('code', 'radar.captures.too_large');
        $this->deposer([UploadedFile::fake()->createWithContent('illisible.jpg', "\xFF\xD8\xFF tronqué")])
            ->assertStatus(422)->assertJsonPath('code', 'radar.captures.unreadable');
        $this->deposer([UploadedFile::fake()->create('reponse.pdf', 20, 'application/pdf')])
            ->assertStatus(422)->assertJsonValidationErrors(['captures.0']);
        $this->deposer([])->assertStatus(422)->assertJsonValidationErrors(['captures']);
        // Une bonne et une démesurée : le tout est refusé, la bonne n'est pas rangée.
        $this->deposer([$this->png(), UploadedFile::fake()->createWithContent('grande.png', $this->pngDeDimensions(7_000, 7_000))])
            ->assertStatus(422)->assertJsonPath('code', 'radar.captures.too_large');

        $this->assertSame($avant, $this->etat());
        Bus::assertNothingDispatched();
    }

    public function test_un_message_non_envoye_clos_ou_relance_ne_recoit_pas_de_reponse(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $brouillon = RadarOutreach::factory()->withListings($this->annonce)->create(['radar_advertiser_id' => $this->annonceur->id]);
        $avant = $this->etat();

        $this->deposer([$this->png()], $brouillon)->assertStatus(409)->assertJsonPath('code', 'radar.outreach.not_sent');

        $clos = RadarOutreach::factory()->withListings($this->annonce)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'outcome' => 'refused', 'outcome_at' => now(),
        ]);
        $this->deposer([$this->png()], $clos)->assertStatus(409)->assertJsonPath('code', 'radar.outreach.outcome_final');

        // Une question reste ouverte : on peut encore y répondre.
        $question = RadarOutreach::factory()->withListings($this->annonce)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'outcome' => 'question', 'outcome_at' => now(),
        ]);
        $this->deposer([$this->png()], $question)->assertCreated();
        RadarConsent::query()->delete();
        DB::table('media')->delete();

        $relance = RadarOutreach::factory()->withListings($this->annonce)->sent()->followUpOf($this->message)->create();
        $this->deposer([$this->png()])->assertStatus(409)->assertJsonPath('code', 'radar.outreach.superseded');
        // La relance, elle, reçoit la réponse.
        $this->deposer([$this->png()], $relance)->assertCreated();

        $this->assertSame(1, RadarConsent::query()->count());
        $this->assertNotSame($avant, $this->etat());
    }

    public function test_un_brouillon_de_relance_ne_bloque_pas_la_reponse_au_message_envoye(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        RadarOutreach::factory()->withListings($this->annonce)->followUpOf($this->message)->create();

        $this->deposer([$this->png()])->assertCreated();
    }

    public function test_un_annonceur_qui_a_dit_stop_ne_recoit_pas_de_reponse(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        RadarAdvertiser::query()->whereKey($this->annonceur->id)->update(['phone' => null, 'do_not_contact_at' => now()]);
        $avant = $this->etat();

        $this->deposer([$this->png()])->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');

        $this->assertSame($avant, $this->etat());
    }

    public function test_deposer_sans_la_prise_en_charge_est_refuse_avant_tout_decodage(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $this->deleteJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertNoContent();
        $avant = $this->etat();

        $this->deposer([UploadedFile::fake()->createWithContent('grande.png', $this->pngDeDimensions(20_001, 1))])
            ->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');

        $this->assertSame($avant, $this->etat());
    }

    // --- Le job ------------------------------------------------------------------------------------

    public function test_le_job_ecrit_le_verdict_la_transcription_et_une_suggestion_et_jamais_une_confirmation(): void
    {
        $recu = null;
        $pieces = null;
        $modele = null;
        RadarConsentVerification::fake(function (string $prompt, Collection $attachments, $provider, string $model) use (&$recu, &$pieces, &$modele) {
            $recu = $prompt;
            $pieces = $attachments->map(fn ($piece) => [$piece::class, $piece->mimeType()])->all();
            $modele = $model;

            return $this->sortie();
        });
        $reponse = $this->reponseDeposee();
        $avant = RadarListing::query()->pluck('stage', 'id')->map(fn ($s) => $s->value)->all();

        $this->lancer($reponse)->assertNotReleased();

        $reponse->refresh();
        $this->assertSame(RadarVerificationStatus::Done, $reponse->verification_status);
        $this->assertNull($reponse->verification_reason);
        $this->assertSame("Takussan : Bonjour Awa, ...\nAnnonceur : OUI", $reponse->transcript);
        $this->assertSame('consent', $reponse->ai_verdict['classification']);
        $this->assertTrue($reponse->ai_verdict['number_matches']);
        $this->assertSame('code', $reponse->ai_verdict['number_checked_by']);
        $this->assertTrue($reponse->ai_verdict['clauses_complete']);
        $this->assertSame([], $reponse->ai_verdict['discordances']);
        // AC3 : un verdict n'est pas une confirmation, et ne déplace aucune annonce.
        $this->assertNull($reponse->confirmed_at);
        $this->assertNull($reponse->confirmed_by_id);
        $this->assertSame($avant, RadarListing::query()->pluck('stage', 'id')->map(fn ($s) => $s->value)->all());
        $this->assertNull($this->message->fresh()->outcome);

        // La suggestion en attente : la proposition n'a ni transcription ni numéro.
        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame('radar.verification_accord', $suggestion->usage_key);
        $this->assertSame(AiSuggestionDecision::Pending, $suggestion->decision);
        $this->assertSame($reponse->id, $suggestion->subject_id);
        $this->assertEquals(['classification' => 'consent', 'number_matches' => true, 'clauses_found' => [1, 2, 3, 4]], $suggestion->proposal);
        $this->assertStringNotContainsString('771234567', $suggestion->toJson());
        $this->assertStringNotContainsString('Awa', $suggestion->toJson());

        // Ce que reçoit le modèle : le message envoyé EXACT, le numéro et le nom attendus, les clauses, les captures jointes.
        $this->assertStringContainsString($this->message->message, (string) $recu);
        $this->assertStringContainsString('Numéro attendu : '.self::NUMERO, (string) $recu);
        $this->assertStringContainsString('Nom attendu : Awa Fall', (string) $recu);
        $this->assertStringContainsString('Clauses numérotées : 1 à 4', (string) $recu);
        $this->assertStringContainsString('contenu_externe_', (string) $recu);
        $this->assertSame([[StoredImage::class, 'image/png']], $pieces);
        $this->assertSame('modele-v', $modele);
        $appel = AiCall::query()->sole();
        $this->assertSame(AiModelRole::Vision, $appel->role);
        $this->assertSame('radar.verification_accord', $appel->usage_key);
    }

    public function test_sous_la_file_synchrone_le_depot_lance_le_job_apres_le_commit(): void
    {
        RadarConsentVerification::fake(fn () => $this->sortie(['classification' => 'question', 'clauses_found' => [1]]));

        $id = $this->deposer([$this->png()])->assertCreated()->json('data.id');

        $reponse = RadarConsent::query()->findOrFail($id);
        $this->assertSame(RadarVerificationStatus::Done, $reponse->verification_status);
        $this->assertSame(['clauses_missing', 'not_consent'], $reponse->ai_verdict['discordances']);
        $this->assertNull($reponse->confirmed_at);
        RadarConsentVerification::assertPromptedTimes(1);
    }

    public function test_un_numero_different_est_rendu_faux_par_le_code_meme_si_le_modele_dit_vrai(): void
    {
        RadarConsentVerification::fake(fn () => $this->sortie(['counterpart_phone' => '+221 78 999 88 77', 'number_matches' => true]));
        $reponse = $this->reponseDeposee();

        $this->lancer($reponse);

        $verdict = $reponse->fresh()->ai_verdict;
        $this->assertFalse($verdict['number_matches']);
        $this->assertSame(['number_mismatch'], $verdict['discordances']);
        $this->assertFalse(AiSuggestion::query()->sole()->proposal['number_matches']);
    }

    public function test_un_second_passage_ne_refait_rien(): void
    {
        RadarConsentVerification::fake(fn () => $this->sortie());
        $reponse = $this->reponseDeposee();
        $this->lancer($reponse);

        $this->lancer($reponse);

        RadarConsentVerification::assertPromptedTimes(1);
        $this->assertSame(1, AiSuggestion::query()->count());
    }

    public function test_un_verdict_qui_arrive_apres_une_autre_issue_ne_l_ecrase_pas(): void
    {
        $reponse = null;
        RadarConsentVerification::fake(function () use (&$reponse) {
            // Pendant que le modèle répond, la réponse passe en échec (la fenêtre de reprise, un autre passage…).
            RadarConsent::query()->whereKey($reponse->id)->update(['verification_status' => 'failed', 'verification_reason' => 'radar.verification.timeout']);

            return $this->sortie();
        });
        $reponse = $this->reponseDeposee();

        $this->lancer($reponse);

        $reponse->refresh();
        $this->assertSame([RadarVerificationStatus::Failed, 'radar.verification.timeout'], [$reponse->verification_status, $reponse->verification_reason]);
        $this->assertNull($reponse->ai_verdict);
        $this->assertSame(0, AiSuggestion::query()->count());
    }

    public function test_la_prise_est_rejugee_sous_verrou_apres_la_lecture_des_images(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $autre = $this->operateur(PlatformProfileLevel::Support);
        // Le décodage des images prend du temps : pendant qu'il tourne, la prise passe à un autre opérateur.
        $source = $this->png();
        $capture = new class($source->getRealPath(), function () use ($autre): void {
            RadarAdvertiser::query()->whereKey($this->annonceur->id)->update([
                'claimed_by_id' => $autre->id, 'claimed_at' => now(), 'claim_expires_at' => now()->addMinutes(10),
            ]);
        }) extends UploadedFile
        {

            public function __construct(string $chemin, private readonly \Closure $quandLu)
            {
                parent::__construct($chemin, 'a.png', 'image/png', null, true);
            }

            public function getRealPath(): string|false
            {
                ($this->quandLu)();

                return parent::getRealPath();
            }
        };
        $avant = $this->etat();

        try {
            $this->app->make(RadarConsentWorkflow::class)->depositReply($this->message, [$capture], $this->operateur);
            $this->fail('La prise d\'un autre aurait dû refuser le dépôt.');
        } catch (ApiError $e) {
            $this->assertSame(409, $e->getStatusCode());
            $this->assertSame('radar.advertiser.claimed_by_other', $e->errorCode);
        }

        $this->assertSame($avant, $this->etat());
        Bus::assertNothingDispatched();
    }

    public function test_une_panne_laisse_la_reponse_en_attente_avec_le_code_puis_reussit(): void
    {
        RadarConsentVerification::fake(fn () => throw RateLimitedException::forProvider('anthropic'));
        $reponse = $this->reponseDeposee();

        $this->lancer($reponse)->assertReleased(60);

        $reponse->refresh();
        $this->assertSame([RadarVerificationStatus::Pending, 'ai.providers_unavailable'], [$reponse->verification_status, $reponse->verification_reason]);
        $this->assertNull($reponse->ai_verdict);

        RadarConsentVerification::fake(fn () => $this->sortie());
        $this->lancer($reponse)->assertNotReleased();
        $reponse->refresh();
        $this->assertSame([RadarVerificationStatus::Done, null], [$reponse->verification_status, $reponse->verification_reason]);
    }

    public function test_le_plafond_et_le_coupe_circuit_attendent_une_demi_heure(): void
    {
        RadarConsentVerification::fake();
        $reponse = $this->reponseDeposee();

        config(['ai.budgets.daily_global_xof' => 0]);
        $this->lancer($reponse)->assertReleased(1800);
        $this->assertSame([RadarVerificationStatus::Pending, 'ai.budget'], [$reponse->fresh()->verification_status, $reponse->fresh()->verification_reason]);

        config(['ai.budgets.daily_global_xof' => null]);
        AiUsageSetting::query()->create(['usage_key' => 'radar.verification_accord', 'enabled' => false]);
        $this->lancer($reponse)->assertReleased(1800);
        $this->assertSame('ai.kill_switch', $reponse->fresh()->verification_reason);
        RadarConsentVerification::assertNeverPrompted();
    }

    public function test_un_operateur_sans_le_droit_fait_echouer_la_verification_avec_le_code_du_refus(): void
    {
        RadarConsentVerification::fake();
        $reponse = $this->reponseDeposee();
        $reponse->forceFill(['deposited_by_id' => $this->operateur(PlatformProfileLevel::Viewer)->id])->save();

        $this->lancer($reponse)->assertNotReleased();

        $this->assertSame([RadarVerificationStatus::Failed, 'ai.forbidden'], [$reponse->fresh()->verification_status, $reponse->fresh()->verification_reason]);
        RadarConsentVerification::assertNeverPrompted();
    }

    public function test_une_sortie_invalide_fait_echouer_la_verification(): void
    {
        $invalide = $this->sortie();
        unset($invalide['classification']);
        RadarConsentVerification::fake([$invalide]);
        $reponse = $this->reponseDeposee();

        $this->lancer($reponse)->assertNotReleased();

        $reponse->refresh();
        $this->assertSame([RadarVerificationStatus::Failed, 'radar.verification.invalid_output'], [$reponse->verification_status, $reponse->verification_reason]);
        $this->assertNull($reponse->ai_verdict);
        $this->assertSame(0, AiSuggestion::query()->count());

        // Une classification hors de la liste : même issue.
        RadarConsentVerification::fake([$this->sortie(['classification' => 'accord'])]);
        $autre = $this->reponseDeposee();
        $this->lancer($autre);
        $this->assertSame('radar.verification.invalid_output', $autre->fresh()->verification_reason);
    }

    public function test_une_erreur_de_programmation_fait_echouer_la_verification_et_se_rapporte(): void
    {
        RadarConsentVerification::fake(fn () => throw new \Error('boom'));
        $reponse = $this->reponseDeposee();
        Exceptions::fake();

        $this->lancer($reponse)->assertNotReleased();

        Exceptions::assertReported(fn (\Error $e) => $e->getMessage() === 'boom');

        $this->assertSame([RadarVerificationStatus::Failed, 'radar.verification.error'], [$reponse->fresh()->verification_status, $reponse->fresh()->verification_reason]);
    }

    public function test_une_panne_du_fournisseur_n_est_pas_un_bug_et_ne_se_rapporte_pas(): void
    {
        // Une exception que la passerelle ne range pas elle-même (ni limite, ni refus) : elle attend, sans bruit de bug.
        RadarConsentVerification::fake(fn () => throw new \RuntimeException('connexion coupée'));
        $reponse = $this->reponseDeposee();
        Exceptions::fake();

        $this->lancer($reponse)->assertReleased(60);

        Exceptions::assertNothingReported();
    }

    public function test_un_imprevu_apres_l_appel_paye_fait_echouer_la_reponse_sans_repayer(): void
    {
        RadarConsentVerification::fake(fn () => $this->sortie());
        $reponse = $this->reponseDeposee();
        // La suggestion ne s'écrit pas : l'écriture du verdict est annulée APRÈS l'appel payé.
        AiSuggestion::creating(fn () => throw new \RuntimeException('base indisponible'));

        try {
            $this->lancer($reponse)->assertNotReleased();
        } finally {
            AiSuggestion::flushEventListeners();
        }

        $reponse->refresh();
        $this->assertSame([RadarVerificationStatus::Failed, VerifyRadarConsentReply::REASON_UNEXPECTED], [$reponse->verification_status, $reponse->verification_reason]);
        $this->assertNull($reponse->ai_verdict);
        $this->assertSame(0, AiSuggestion::query()->count());
        RadarConsentVerification::assertPromptedTimes(1);
    }

    public function test_un_imprevu_hors_de_l_appel_attend_sous_son_propre_motif_et_non_sous_celui_de_la_fenetre(): void
    {
        RadarConsentVerification::fake();
        $reponse = $this->reponseDeposee();
        // Une version de clauses dont le fichier manque : la lecture des clauses échoue (RuntimeException) HORS de l'appel.
        $this->message->forceFill(['clauses_version' => 'v999'])->save();

        $this->lancer($reponse)->assertReleased(60);

        $reponse->refresh();
        $this->assertSame(RadarVerificationStatus::Pending, $reponse->verification_status);
        $this->assertSame(VerifyRadarConsentReply::REASON_UNEXPECTED, $reponse->verification_reason);
        $this->assertSame('radar.verification.unexpected', $reponse->verification_reason);
        RadarConsentVerification::assertNeverPrompted();

        // Fenêtre épuisée : la réponse passe en échec avec CE motif, pas avec `timeout`.
        (new VerifyRadarConsentReply($reponse->id))->failed(null);
        $this->assertSame('radar.verification.unexpected', $reponse->fresh()->verification_reason);
    }

    public function test_une_reponse_sans_capture_ou_sans_numero_attendu_echoue_sans_appeler_le_modele(): void
    {
        RadarConsentVerification::fake();
        $reponse = $this->reponseDeposee();
        $reponse->clearMediaCollection('radar_consent_captures');
        $this->lancer($reponse);
        $this->assertSame('radar.verification.no_capture', $reponse->fresh()->verification_reason);

        $autre = $this->reponseDeposee();
        RadarAdvertiser::query()->whereKey($this->annonceur->id)->update(['phone' => null, 'do_not_contact_at' => now()]);
        $this->lancer($autre);
        $this->assertSame([RadarVerificationStatus::Failed, 'radar.verification.no_number'], [$autre->fresh()->verification_status, $autre->fresh()->verification_reason]);
        RadarConsentVerification::assertNeverPrompted();
    }

    public function test_la_fenetre_de_reprise_passe_la_reponse_en_echec_avec_son_dernier_motif(): void
    {
        RadarConsentVerification::fake(fn () => throw RateLimitedException::forProvider('anthropic'));
        $reponse = $this->reponseDeposee();
        $job = $this->lancer($reponse);
        $this->assertSame('ai.providers_unavailable', $reponse->fresh()->verification_reason);

        $job->failed(null);
        $this->assertSame([RadarVerificationStatus::Failed, 'ai.providers_unavailable'], [$reponse->fresh()->verification_status, $reponse->fresh()->verification_reason]);

        // Sans motif posé : radar.verification.timeout. Et une issue déjà écrite n'est jamais réécrite.
        $nue = RadarConsent::factory()->create(['radar_outreach_id' => $this->message->id]);
        (new VerifyRadarConsentReply($nue->id))->failed(null);
        $this->assertSame('radar.verification.timeout', $nue->fresh()->verification_reason);
        $faite = RadarConsent::factory()->verified(['classification' => 'consent'])->create(['radar_outreach_id' => $this->message->id]);
        (new VerifyRadarConsentReply($faite->id))->failed(null);
        $this->assertSame(RadarVerificationStatus::Done, $faite->fresh()->verification_status);
    }

    public function test_le_job_respecte_les_regles_de_file_de_l_adr_0078(): void
    {
        $job = new VerifyRadarConsentReply(1);

        $this->assertSame(85, $job->timeout);
        $this->assertFalse($job->failOnTimeout);
        $this->assertLessThanOrEqual((int) config('queue.connections.database.retry_after') - 5, $job->timeout);
        $this->assertSame(75, VerifyRadarConsentReply::AI_CALL_BUDGET_SECONDS);
        $this->assertSame([60, 300, 900, 3600], $job->backoff());
        $this->assertTrue($job->retryUntil()->equalTo(now()->addHours(24)));
        $this->assertNull($job->queue, 'la file `default`');
        $this->assertCount(1, $job->middleware());
    }

    // --- Outils ------------------------------------------------------------------------------------

    /** Un JPEG de 8×8 px auquel on greffe à la main un segment APP1 « Exif » (IFD0 : `Make` + un IFD GPS : `GPSLatitude`). */
    private function jpegAvecExif(): string
    {
        $image = imagecreatetruecolor(8, 8);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 168, 83, 50));
        ob_start();
        imagejpeg($image);
        $jpeg = (string) ob_get_clean();

        // Disposition : IFD0 en 8 (2 entrées, 30 octets) · `Make` en 38 (12 octets) · IFD GPS en 50 (2 entrées, 30 octets)
        // · trois rationnels de latitude en 80 (24 octets).
        $make = "TakussanCam\0";
        $tiff = "II*\x00".pack('V', 8)
            .pack('v', 2)
            .pack('vvVV', 0x010F, 2, strlen($make), 38)
            .pack('vvVV', 0x8825, 4, 1, 50)
            .pack('V', 0)
            .$make
            .pack('v', 2)
            .pack('vvV', 0x0001, 2, 2)."N\0\0\0"
            .pack('vvVV', 0x0002, 5, 3, 80)
            .pack('V', 0)
            .pack('VVVVVV', 14, 1, 40, 1, 0, 1);
        $charge = "Exif\x00\x00".$tiff;

        return substr($jpeg, 0, 2)."\xFF\xE1".pack('n', strlen($charge) + 2).$charge.substr($jpeg, 2);
    }

    /** Un vrai PNG de 1 px dont l'en-tête IHDR annonce d'autres dimensions (CRC recalculé). */
    private function pngDeDimensions(int $largeur, int $hauteur): string
    {
        $image = imagecreatetruecolor(1, 1);
        ob_start();
        imagepng($image);
        $png = (string) ob_get_clean();
        $ihdr = pack('NN', $largeur, $hauteur).substr($png, 24, 5);

        return substr($png, 0, 16).$ihdr.pack('N', crc32('IHDR'.$ihdr)).substr($png, 33);
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
