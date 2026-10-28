<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarConsentMessage;
use App\Ai\Agents\RadarConsentVerification;
use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\RadarAdvertiserDirectory;
use App\Services\Radar\RadarConsentCoverage;
use App\Support\RadarPhone;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2388 (ADR-0077 §3, §8, AC2 à AC4) — l'issue d'un message d'accord : le seul geste qui confirme une réponse.
 * Un accord confirmé couvre toutes les annonces du message ; un verdict de l'IA seul n'ouvre rien ; un STOP ferme
 * l'annonceur entier sans rien purger. Aucun modèle réel : `RadarConsentVerification::fake()`.
 */
class RadarConsentTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private const NUMERO = '+221771234567';

    private User $operateur;

    private RadarAdvertiser $annonceur;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-28 10:00:00');
        $this->installerSocleDEssai();
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.roles.raisonnement' => [['provider' => 'anthropic', 'model' => 'modele-r', 'max_tokens' => 2000]],
            'ai.roles.redaction' => [['provider' => 'anthropic', 'model' => 'modele-a', 'max_tokens' => 1000]],
            'ai.pricing.anthropic.modele-v' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
            'ai.pricing.anthropic.modele-r' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
            'ai.pricing.anthropic.modele-a' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
            'app.frontend_url' => 'https://front.exemple.test',
        ]);
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);

        $this->operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Fall']);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // --- Outils ------------------------------------------------------------------------------------

    /** @param  array<string, mixed>  $surcharge */
    private function annonce(array $surcharge = []): RadarListing
    {
        return RadarListing::factory()->reviewed()->create($surcharge + ['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Contacted]);
    }

    /** Un message ENVOYÉ qui couvre ces annonces (une seule, à défaut). */
    private function message(RadarListing ...$annonces): RadarOutreach
    {
        $annonces = $annonces === [] ? [$this->annonce()] : $annonces;
        $texte = $this->app->make(ConsentMessageComposer::class)->compose('fr', 'Bonjour Awa,', 'vos annonces à Ouakam');

        return RadarOutreach::factory()->withListings(...$annonces)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'salutation' => 'Bonjour Awa,', 'summary' => 'vos annonces à Ouakam',
            'message' => $texte, 'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
    }

    /** @param  array<string, mixed>  $surcharge */
    private function verdict(array $surcharge = []): array
    {
        return $surcharge + [
            'classification' => 'consent', 'confidence' => 'high', 'transcript' => 'Annonceur : OUI', 'reply_text' => 'OUI',
            'counterpart_phone' => self::NUMERO, 'counterpart_name' => 'Awa Fall', 'number_matches' => true, 'number_checked_by' => 'code',
            'name_matches' => true, 'clauses_found' => [1, 2, 3, 4], 'clauses_complete' => true,
        ];
    }

    /** Une réponse déjà vérifiée, sans passer par le job. @param  array<string, mixed>|null  $verdict */
    private function reponse(RadarOutreach $message, ?array $verdict = null): RadarConsent
    {
        $factory = RadarConsent::factory();

        return ($verdict === null ? $factory : $factory->verified($verdict))->create(['radar_outreach_id' => $message->id]);
    }

    /** Une sortie complète du modèle : un « oui » concordant, sauf ce qui est surchargé. @param  array<string, mixed>  $surcharge */
    private function sortie(array $surcharge = []): array
    {
        return $surcharge + [
            'transcript' => 'Annonceur : OUI', 'reply_text' => 'OUI', 'counterpart_phone' => '77 123 45 67', 'counterpart_name' => 'Awa Fall',
            'number_matches' => true, 'name_matches' => true, 'clauses_found' => [1, 2, 3, 4], 'classification' => 'consent', 'confidence' => 'high',
        ];
    }

    /** Dépose une capture : avec la file synchrone, le job de vérification tourne aussitôt (modèle simulé). */
    private function deposer(RadarOutreach $message): RadarConsent
    {
        $id = $this->post("/api/admin/radar/outreaches/{$message->id}/reply", ['captures' => [UploadedFile::fake()->image('a.png', 40, 40)]], ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');

        return RadarConsent::query()->findOrFail($id);
    }

    private function issue(RadarOutreach $message, string $issue, ?string $motif = null): TestResponse
    {
        return $this->postJson("/api/admin/radar/outreaches/{$message->id}/outcome", ['outcome' => $issue] + ($motif === null ? [] : ['reason' => $motif]));
    }

    private function etape(RadarListing $annonce): string
    {
        return $annonce->fresh()->stage->value;
    }

    /** @return array<string, mixed> ce qu'un refus ne doit pas changer */
    private function etat(): array
    {
        return [
            RadarOutreach::query()->orderBy('id')->get()->map->getAttributes()->all(),
            RadarListing::query()->orderBy('id')->get()->map->getAttributes()->all(),
            RadarConsent::query()->orderBy('id')->get()->map->getAttributes()->all(),
            RadarAdvertiser::query()->orderBy('id')->get()->map->getAttributes()->all(),
            AiSuggestion::query()->orderBy('id')->get()->map->getAttributes()->all(),
            Activity::query()->where('event', 'radar_outreach_outcome')->count(),
        ];
    }

    // --- AC2 ---------------------------------------------------------------------------------------

    public function test_ac2_un_accord_confirme_couvre_toutes_les_annonces_du_message(): void
    {
        $trois = [$this->annonce(), $this->annonce(), $this->annonce()];
        $horsMessage = $this->annonce(['stage' => RadarListingStage::Reviewed]);
        $message = $this->message(...$trois);
        $reponse = $this->reponse($message, $this->verdict());

        $this->issue($message, 'consented')
            ->assertOk()
            ->assertJsonPath('data.outcome', 'consented')
            ->assertJsonPath('data.consents.0.id', $reponse->id);

        foreach ($trois as $annonce) {
            $this->assertSame('consented', $this->etape($annonce));
        }
        $this->assertEqualsCanonicalizing(
            array_map(fn (RadarListing $a) => $a->id, $trois),
            app(RadarConsentCoverage::class)->coveredListingIds($this->annonceur),
        );
        // Un accord par message : une seule ligne confirmée.
        $this->assertSame(1, RadarConsent::query()->whereNotNull('confirmed_at')->count());
        $confirmee = $reponse->fresh();
        $this->assertSame($this->operateur->id, $confirmee->confirmed_by_id);
        $this->assertNull($confirmee->confirmation_reason);
        $this->assertSame([], app(RadarConsentCoverage::class)->coveredAmong([$horsMessage->id]));
        $this->assertSame('reviewed', $this->etape($horsMessage));

        // La quatrième annonce, hors du message, reste préparable.
        RadarConsentMessage::fake(fn () => ['salutation' => 'Bonjour Awa,', 'resume' => 'votre annonce']);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/outreaches", ['listing_ids' => [$horsMessage->id]])->assertCreated();
    }

    // --- AC3 ---------------------------------------------------------------------------------------

    public function test_ac3_un_verdict_accord_non_confirme_n_ouvre_rien(): void
    {
        $annonce = $this->annonce();
        $message = $this->message($annonce);
        RadarConsentVerification::fake(fn () => $this->sortie());

        $reponse = $this->deposer($message);

        // Le job a classé `consent`, concordant, `high` : il n'a écrit qu'un verdict.
        $reponse->refresh();
        $this->assertSame('consent', $reponse->ai_verdict['classification']);
        $this->assertSame([], $reponse->ai_verdict['discordances']);
        $this->assertSame('high', $reponse->ai_verdict['confidence']);
        $this->assertNull($reponse->confirmed_at);
        $this->assertNull($reponse->confirmed_by_id);
        $this->assertSame('contacted', $this->etape($annonce));
        $this->assertSame([], app(RadarConsentCoverage::class)->coveredAmong([$annonce->id]));
        $this->assertSame([], app(RadarConsentCoverage::class)->coveredListingIds($this->annonceur));
        $this->assertNull($message->fresh()->outcome);

        // Une relance du message est acceptée : ce n'est pas un accord valide (`listing_consented`).
        RadarConsentMessage::fake(fn () => ['salutation' => 'Bonjour Awa,', 'resume' => 'votre annonce']);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/outreaches", ['follow_up_of_id' => $message->id])->assertCreated();
    }

    // --- Confirmation contre un verdict discordant --------------------------------------------------

    /** @return array<string, array{0: ?array<string, mixed>, 1: list<string>}> */
    public static function verdictsDiscordants(): array
    {
        return [
            'numéro discordant' => [['number_matches' => false], ['number_mismatch']],
            'clauses absentes' => [['clauses_complete' => false, 'clauses_found' => [1, 2]], ['clauses_missing']],
            'classement autre qu\'un accord' => [['classification' => 'question'], ['not_consent']],
            'aucun verdict' => [null, ['no_verdict']],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $surcharge
     * @param  list<string>  $discordances
     */
    #[DataProvider('verdictsDiscordants')]
    public function test_une_confirmation_contre_un_verdict_discordant_exige_un_motif(?array $surcharge, array $discordances): void
    {
        $annonce = $this->annonce();
        $message = $this->message($annonce);
        $reponse = $this->reponse($message, $surcharge === null ? null : $this->verdict($surcharge));
        $avant = $this->etat();

        $this->issue($message, 'consented')
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.consent.reason_required')
            ->assertJsonPath('params.discordances', $discordances);
        $this->issue($message, 'consented', "  \u{200B}  ")->assertStatus(422)->assertJsonPath('code', 'radar.consent.reason_required');
        $this->assertSame($avant, $this->etat());

        $this->issue($message, 'consented', 'Capture lue par l\'opérateur : le « oui » est clair.')->assertOk();

        $this->assertSame('consented', $this->etape($annonce));
        $this->assertSame('Capture lue par l\'opérateur : le « oui » est clair.', $reponse->fresh()->confirmation_reason);
        $ligne = Activity::query()->where('event', 'radar_outreach_outcome')->sole();
        $this->assertSame('Capture lue par l\'opérateur : le « oui » est clair.', $ligne->properties['reason']);
        $this->assertSame($discordances, $ligne->properties['discordances']);
        $this->assertSame($reponse->id, $ligne->properties['consent_id']);
    }

    public function test_une_confirmation_concordante_n_exige_pas_de_motif_et_n_en_garde_pas(): void
    {
        $message = $this->message();
        $reponse = $this->reponse($message, $this->verdict());

        $this->issue($message, 'consented', 'Rien à signaler.')->assertOk();

        $this->assertNull($reponse->fresh()->confirmation_reason);
        $this->assertSame([], Activity::query()->where('event', 'radar_outreach_outcome')->sole()->properties['discordances'] ?? []);
    }

    public function test_consented_sans_reponse_deposee_rend_422(): void
    {
        $annonce = $this->annonce();
        $message = $this->message($annonce);
        $avant = $this->etat();

        $this->issue($message, 'consented', 'je confirme quand même')->assertStatus(422)->assertJsonPath('code', 'radar.consent.reply_required');

        $this->assertSame($avant, $this->etat());
        $this->assertSame('contacted', $this->etape($annonce));
    }

    public function test_confirmer_un_message_dont_une_annonce_a_quitte_l_etape_contacted_rend_409(): void
    {
        $a = $this->annonce();
        $b = $this->annonce();
        $message = $this->message($a, $b);
        $this->reponse($message, $this->verdict());
        $b->forceFill(['stage' => RadarListingStage::Discarded])->save();
        $avant = $this->etat();

        $this->issue($message, 'consented')->assertStatus(409)->assertJsonPath('code', 'radar.listing.stage_conflict')->assertJsonPath('params.listing_id', $b->id);

        $this->assertSame($avant, $this->etat());
        $this->assertSame(0, RadarConsent::query()->whereNotNull('confirmed_at')->count());
    }

    // --- AC4 : STOP --------------------------------------------------------------------------------

    public function test_ac4_stop_rend_l_annonceur_do_not_contact_garde_l_empreinte_et_refuse_un_nouveau_message(): void
    {
        $ouverte = $this->annonce();
        $revue = $this->annonce(['stage' => RadarListingStage::Reviewed]);
        $accordee = $this->annonce(['stage' => RadarListingStage::Consented]);
        $ecartee = $this->annonce(['stage' => RadarListingStage::Discarded]);
        // Un accord valide antérieur, sur un autre message.
        $ancien = $this->message($accordee);
        $valide = RadarConsent::factory()->confirmed($this->operateur)->create(['radar_outreach_id' => $ancien->id]);
        $message = $this->message($ouverte);

        $this->issue($message, 'stop')
            ->assertOk()
            ->assertJsonPath('data.outcome', 'stop');

        $annonceur = $this->annonceur->fresh();
        $this->assertNotNull($annonceur->do_not_contact_at);
        $this->assertSame(RadarPhone::hmac(self::NUMERO), $annonceur->phone_hmac);
        $this->assertSame($annonceur->id, app(RadarAdvertiserDirectory::class)->refusedAmong([self::NUMERO])?->id);
        foreach ([$ouverte, $revue, $accordee] as $annonce) {
            $this->assertSame('do_not_contact', $this->etape($annonce));
        }
        $this->assertSame('discarded', $this->etape($ecartee));
        // Le STOP retire l'accord ; il ne purge rien ici (TCK-2391).
        $this->assertNotNull($valide->fresh()->revoked_at);
        $this->assertSame([], app(RadarConsentCoverage::class)->coveredListingIds($annonceur));
        $this->assertSame(self::NUMERO, $annonceur->phone);
        $this->assertNotNull($ouverte->fresh()->raw_text);

        // Un nouveau message est refusé.
        $suivante = $this->annonce(['stage' => RadarListingStage::Reviewed]);
        $this->postJson("/api/admin/radar/advertisers/{$annonceur->id}/outreaches", ['listing_ids' => [$suivante->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');

        // Une saisie de texte qui porte ce numéro naît `do_not_contact`.
        Queue::fake();
        $this->postJson('/api/admin/radar/listings', ['text' => 'Appartement F4 à louer aux Almadies, 450.000f/mois. Contact 77 123 45 67'])
            ->assertCreated()->assertJsonPath('data.0.stage', 'do_not_contact');
    }

    public function test_un_stop_pose_sur_un_numero_deja_connu_de_la_fiche_ferme_les_annonces_que_le_message_ne_couvre_pas(): void
    {
        $couverte = $this->annonce();
        $autre = $this->annonce(['stage' => RadarListingStage::Extracted]);
        $message = $this->message($couverte);

        $this->issue($message, 'stop')->assertOk();

        $this->assertSame('do_not_contact', $this->etape($couverte));
        $this->assertSame('do_not_contact', $this->etape($autre));
        $ligne = Activity::query()->where('event', 'radar_outreach_outcome')->sole();
        $this->assertEqualsCanonicalizing([$couverte->id, $autre->id], $ligne->properties['listing_ids']);
        $this->assertStringNotContainsString('771234567', $ligne->toJson());
    }

    public function test_stop_avec_une_cle_d_empreinte_changee_reecrit_l_empreinte_et_l_annonceur_se_retrouve(): void
    {
        $message = $this->message();
        config(['radar.phone_hmac_key' => 'une-autre-cle']);
        $this->assertNotSame(RadarPhone::hmac(self::NUMERO), $this->annonceur->fresh()->phone_hmac);

        $this->issue($message, 'stop')->assertOk();

        $this->assertSame(RadarPhone::hmac(self::NUMERO), $this->annonceur->fresh()->phone_hmac);
        $this->assertSame($this->annonceur->id, app(RadarAdvertiserDirectory::class)->refusedAmong([self::NUMERO])?->id);
    }

    public function test_un_stop_deja_dit_refuse_toute_issue_sous_verrou(): void
    {
        $annonce = $this->annonce();
        $message = $this->message($annonce);
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();
        $avant = $this->etat();

        foreach (['refused', 'stop', 'question', 'no_answer'] as $issue) {
            $this->issue($message, $issue)->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');
        }

        $this->assertSame($avant, $this->etat());
    }

    // --- Les autres issues ---------------------------------------------------------------------------

    public function test_refused_ferme_les_annonces_du_message_et_l_issue_est_finale(): void
    {
        $a = $this->annonce();
        $b = $this->annonce();
        $horsMessage = $this->annonce();
        $message = $this->message($a, $b);

        $this->issue($message, 'refused', 'Il ne veut pas.')->assertOk()->assertJsonPath('data.outcome', 'refused');

        $this->assertSame(['refused', 'refused', 'contacted'], [$this->etape($a), $this->etape($b), $this->etape($horsMessage)]);
        $apres = $message->fresh();
        $this->assertSame($this->operateur->id, $apres->outcome_by_id);
        $this->assertTrue($apres->outcome_at->equalTo(now()));
        $this->assertNull($this->annonceur->fresh()->do_not_contact_at);
        $avant = $this->etat();

        $this->issue($message, 'consented')->assertStatus(409)->assertJsonPath('code', 'radar.outreach.outcome_final')->assertJsonPath('params.outcome', 'refused');
        $this->assertSame($avant, $this->etat());
    }

    public function test_question_puis_une_reponse_puis_consented_est_permis_et_no_answer_aussi(): void
    {
        $annonce = $this->annonce();
        $message = $this->message($annonce);

        $this->issue($message, 'question')->assertOk();
        $this->assertSame('contacted', $this->etape($annonce));
        $this->assertSame(RadarOutreachOutcome::Question, $message->fresh()->outcome);

        $reponse = $this->reponse($message, $this->verdict());
        $this->issue($message, 'no_answer')->assertOk();
        $this->issue($message, 'consented')->assertOk()->assertJsonPath('data.outcome', 'consented');

        $this->assertSame('consented', $this->etape($annonce));
        $this->assertNotNull($reponse->fresh()->confirmed_at);
    }

    public function test_une_issue_sur_un_message_non_envoye_ou_relance_rend_409(): void
    {
        $annonce = $this->annonce();
        $brouillon = RadarOutreach::factory()->withListings($annonce)->create(['radar_advertiser_id' => $this->annonceur->id]);
        $this->issue($brouillon, 'question')->assertStatus(409)->assertJsonPath('code', 'radar.outreach.not_sent');

        $origine = $this->message($annonce);
        RadarOutreach::factory()->followUpOf($origine)->withListings($annonce)->sent()->create();
        $avant = $this->etat();
        $this->issue($origine, 'refused')->assertStatus(409)->assertJsonPath('code', 'radar.outreach.superseded');

        $this->assertSame($avant, $this->etat());
        $this->assertSame('contacted', $this->etape($annonce));
    }

    public function test_le_corps_est_valide_et_le_viewer_refuse(): void
    {
        $message = $this->message();

        $this->postJson("/api/admin/radar/outreaches/{$message->id}/outcome", [])->assertStatus(422);
        $this->postJson("/api/admin/radar/outreaches/{$message->id}/outcome", ['outcome' => 'accord'])->assertStatus(422);
        $this->postJson("/api/admin/radar/outreaches/{$message->id}/outcome", ['outcome' => 'question', 'reason' => str_repeat('a', 2001)])->assertStatus(422);

        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $this->issue($message, 'question')->assertForbidden();
        $this->assertNull($message->fresh()->outcome);
    }

    // --- La suggestion de vérification ---------------------------------------------------------------

    /** @return array<string, array{0: string, 1: string, 2: AiSuggestionDecision, 3: array<string, string>}> */
    public static function correspondances(): array
    {
        return [
            'consent suivi par consented' => ['consent', 'consented', AiSuggestionDecision::Accepted, []],
            'consent contredit par refused' => ['consent', 'refused', AiSuggestionDecision::Edited, ['classification' => 'refusal']],
            'refusal suivi par refused' => ['refusal', 'refused', AiSuggestionDecision::Accepted, []],
            'stop suivi par stop' => ['stop', 'stop', AiSuggestionDecision::Accepted, []],
            'question suivi par question' => ['question', 'question', AiSuggestionDecision::Accepted, []],
            'ambiguous est toujours édité' => ['ambiguous', 'question', AiSuggestionDecision::Edited, ['classification' => 'question']],
        ];
    }

    /** @param  array<string, string>  $final */
    #[DataProvider('correspondances')]
    public function test_la_suggestion_de_verification_se_decide_contre_l_issue_humaine(string $classement, string $issue, AiSuggestionDecision $attendue, array $final): void
    {
        $annonce = $this->annonce();
        $message = $this->message($annonce);
        RadarConsentVerification::fake(fn () => $this->sortie(['classification' => $classement]));
        $reponse = $this->deposer($message);
        $this->assertSame(AiSuggestionDecision::Pending, AiSuggestion::query()->sole()->decision);

        // Un motif suffit à confirmer contre un verdict discordant ; les autres issues l'ignorent.
        $this->issue($message, $issue, 'Lu sur la capture.')->assertOk();

        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame($attendue, $suggestion->decision);
        $this->assertSame($this->operateur->id, $suggestion->decided_by_id);
        $this->assertNotNull($suggestion->decided_at);
        if ($attendue === AiSuggestionDecision::Accepted) {
            $this->assertEquals($suggestion->proposal, $suggestion->final_value);
            $this->assertSame([], $suggestion->correction_diff);
        } else {
            $this->assertSame($final['classification'], $suggestion->final_value['classification']);
            $this->assertNotSame([], $suggestion->correction_diff);
        }
        $this->assertSame($reponse->id, (int) $suggestion->subject_id);
    }

    public function test_l_issue_posee_pendant_l_appel_du_modele_decide_la_suggestion_a_l_arrivee_du_job(): void
    {
        $annonce = $this->annonce();
        $message = $this->message($annonce);
        Bus::fake([VerifyRadarConsentReply::class]);
        $reponse = $this->deposer($message);
        $this->assertSame(0, AiSuggestion::query()->count());

        // Pendant que le modèle répond, l'opérateur tranche : refus.
        RadarConsentVerification::fake(function () use ($message) {
            $this->issue($message, 'refused')->assertOk();

            return $this->sortie(['classification' => 'consent']);
        });
        $job = (new VerifyRadarConsentReply($reponse->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        // Le verdict est écrit ; la décision humaine n'est pas réécrite ; la suggestion est décidée contre elle.
        $reponse->refresh();
        $this->assertSame('consent', $reponse->ai_verdict['classification']);
        $this->assertNull($reponse->confirmed_at);
        $this->assertSame(RadarOutreachOutcome::Refused, $message->fresh()->outcome);
        $this->assertSame('refused', $this->etape($annonce));
        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame(AiSuggestionDecision::Edited, $suggestion->decision);
        $this->assertSame($this->operateur->id, $suggestion->decided_by_id);
        $this->assertSame('refusal', $suggestion->final_value['classification']);
    }

    public function test_une_issue_plus_ancienne_que_la_reponse_ne_decide_pas_sa_suggestion(): void
    {
        $message = $this->message();
        $this->issue($message, 'question')->assertOk();
        Carbon::setTestNow('2026-10-28 10:05:00');
        Bus::fake([VerifyRadarConsentReply::class]);
        $reponse = $this->deposer($message);

        RadarConsentVerification::fake(fn () => $this->sortie());
        $this->app->call([(new VerifyRadarConsentReply($reponse->id))->withFakeQueueInteractions(), 'handle']);

        $this->assertSame(AiSuggestionDecision::Pending, AiSuggestion::query()->sole()->decision);
    }

    // --- Verrous -----------------------------------------------------------------------------------

    /** @return list<string> les tables verrouillées (`for update`), dans l'ordre */
    private function verrous(callable $geste): array
    {
        $tables = [];
        DB::listen(function ($requete) use (&$tables): void {
            if (str_contains($requete->sql, ' for update') && preg_match('/from "(\w+)"/', $requete->sql, $m) === 1) {
                $tables[] = $m[1];
            }
        });
        $geste();

        return $tables;
    }

    public function test_les_verrous_se_prennent_dans_l_ordre_annonces_annonceur_message_reponse(): void
    {
        foreach (['consented', 'stop'] as $i => $issue) {
            $message = $this->message();
            $this->reponse($message, $this->verdict());

            $tables = $this->verrous(fn () => $this->issue($message, $issue)->assertOk());

            $ordre = array_values(array_unique(array_filter($tables, fn (string $t) => in_array($t, ['radar_listings', 'radar_advertisers', 'radar_outreaches', 'radar_consents'], true))));
            $this->assertSame(['radar_listings', 'radar_advertisers', 'radar_outreaches', 'radar_consents'], $ordre, "l'ordre des verrous d'une issue {$issue}");
            // Les annonces d'abord, avant le premier verrou de l'annonceur.
            $this->assertSame('radar_listings', $tables[array_search('radar_advertisers', $tables, true) - 1] ?? null);

            // Un autre annonceur et un autre message pour la tour suivante.
            $this->annonceur = RadarAdvertiser::factory()->create(['phone' => '+22177123457'.$i]);
            $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
        }
    }

    public function test_apres_un_stop_la_promotion_d_une_annonce_vers_ce_numero_la_rend_do_not_contact(): void
    {
        $message = $this->message();
        $this->issue($message, 'stop')->assertOk();

        // Une annonce promue vers ce numéro APRÈS le STOP naît `do_not_contact` (même règle que TCK-2386).
        $fiche = RadarListing::factory()->extracted(['phones' => [self::NUMERO]])->create(['raw_text' => 'Contact 77 123 45 67']);
        $this->putJson("/api/admin/radar/listings/{$fiche->id}/advertiser", ['phone' => self::NUMERO])
            ->assertOk()->assertJsonPath('data.stage', 'do_not_contact');
    }
}
