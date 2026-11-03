<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarConsentVerification;
use App\Exceptions\ApiError;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\AiCall;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\IntegrationWebhookLog;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\RadarFollowUps;
use App\Services\Radar\Whatsapp\RadarWhatsappInbox;
use App\Services\Webhooks\WebhookReplayer;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2395 (ADR-0077 §3, §5, AC2, AC3, AC5) — les réponses reçues sur le numéro WhatsApp du Radar. Le webhook est signé
 * et journalisé avant traitement ; une réponse devient une preuve `provider_message` À CONFIRMER, jamais un accord ; sa
 * vérification classe le texte sur `raisonnement`, et le code juge le numéro et les clauses. Aucun réseau ni modèle réel :
 * des corps de webhook écrits à la main, `RadarConsentVerification::fake()`.
 */
class RadarWhatsappReplyTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private const NUMERO = '+221741234567';

    private const NUMERO_RADAR = 'RADAR-222';

    private const JETON = 'jeton-url-radar';

    private const SECRET = 'secret-application-radar';

    private User $operateur;

    private RadarAdvertiser $annonceur;

    private RadarListing $annonce;

    private RadarOutreach $message;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-30 10:00:00');
        $this->installerSocleDEssai();
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.roles.raisonnement' => [['provider' => 'anthropic', 'model' => 'modele-r', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => '3.0', 'output' => '15.0', 'cache_read' => '0.3', 'cache_write' => '3.75'],
            'ai.pricing.anthropic.modele-r' => ['input' => '3.0', 'output' => '15.0', 'cache_read' => '0.3', 'cache_write' => '3.75'],
            'app.frontend_url' => 'https://front.exemple.test',
            'radar_whatsapp.phone_number_id' => self::NUMERO_RADAR,
            'radar_whatsapp.webhook_url_token' => self::JETON,
            'radar_whatsapp.webhook_app_secret' => self::SECRET,
            'radar_whatsapp.webhook_verify_token' => 'jeton-verification-radar',
        ]);
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);

        $this->operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Fall']);
        $this->annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Contacted]);
        $this->message = $this->envoyeParLApi('wamid.ENVOYE-1');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function envoyeParLApi(string $wamid, array $attributs = []): RadarOutreach
    {
        $composer = $this->app->make(ConsentMessageComposer::class);
        $message = RadarOutreach::factory()->withListings($this->annonce)->sent()->create($attributs + [
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => 'accord.v2', 'channel' => RadarOutreachChannel::WhatsappCloud,
            'provider_message_id' => $wamid, 'provider_status' => 'accepted',
            'salutation' => 'Bonjour Awa,', 'summary' => 'votre appartement à Ouakam', 'message' => '',
            'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
        $message->forceFill(['message' => $composer->compose('fr', 'Bonjour Awa,', 'votre appartement à Ouakam', 'accord.v2', $composer->claimUrlFor($message->load('advertiser')))])->save();

        return $message->refresh();
    }

    /** Un message texte de l'annonceur, tel que Meta le rapporte ; `context` : le message auquel il répond. */
    private function texte(string $corps, string $id = 'wamid.RECU-1', ?string $contexte = 'wamid.ENVOYE-1', string $de = '221741234567'): array
    {
        return ['from' => $de, 'id' => $id, 'timestamp' => '1793354400', 'type' => 'text', 'text' => ['body' => $corps]]
            + ($contexte === null ? [] : ['context' => ['from' => '221740000000', 'id' => $contexte]]);
    }

    /** @param  list<array<string, mixed>>  $messages */
    private function corps(array $messages, string $numero = self::NUMERO_RADAR): array
    {
        return ['object' => 'whatsapp_business_account', 'entry' => [['id' => 'WABA-RADAR', 'changes' => [[
            'field' => 'messages',
            'value' => [
                'messaging_product' => 'whatsapp',
                'metadata' => ['display_phone_number' => '221740000000', 'phone_number_id' => $numero],
                'contacts' => [['profile' => ['name' => 'Awa'], 'wa_id' => '221741234567']],
                'messages' => $messages,
            ],
        ]]]]];
    }

    private function recevoir(array $corps, ?string $jeton = null, ?string $secret = null, ?string $signature = null): TestResponse
    {
        $contenu = (string) json_encode($corps);

        return $this->call('POST', '/api/webhooks/whatsapp/radar/'.($jeton ?? self::JETON), [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => $signature ?? 'sha256='.hash_hmac('sha256', $contenu, $secret ?? self::SECRET),
        ], $contenu);
    }

    private function lancer(RadarConsent $reponse): VerifyRadarConsentReply
    {
        $job = (new VerifyRadarConsentReply($reponse->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        return $job;
    }

    /** @param  array<string, mixed>  $surcharge */
    private function sortie(array $surcharge = []): array
    {
        return $surcharge + [
            'transcript' => 'Annonceur : OUI', 'reply_text' => 'OUI', 'counterpart_phone' => null, 'counterpart_name' => null,
            'number_matches' => null, 'name_matches' => null, 'clauses_found' => [], 'classification' => 'consent', 'confidence' => 'high',
        ];
    }

    // --- AC2 : la réponse reçue -------------------------------------------------------------------

    public function test_ac2_un_oui_recu_par_le_webhook_cree_une_preuve_a_confirmer_avec_l_identifiant_du_message(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);

        $this->recevoir($this->corps([$this->texte('OUI')]))->assertOk()->assertJson(['ok' => true]);

        $reponse = RadarConsent::query()->sole();
        $this->assertSame(RadarConsentProof::ProviderMessage, $reponse->proof);
        $this->assertSame('wamid.RECU-1', $reponse->provider_message_id);
        $this->assertSame($this->message->id, $reponse->radar_outreach_id);
        $this->assertSame($this->annonceur->id, $reponse->radar_advertiser_id);
        $this->assertSame('Annonceur : OUI', $reponse->transcript);
        $this->assertSame(RadarVerificationStatus::Pending, $reponse->verification_status);
        $this->assertSame([], $reponse->capture_hashes);
        $this->assertNull($reponse->deposited_by_id);
        // Une preuve À CONFIRMER : rien n'est valide, rien ne bouge.
        $this->assertNull($reponse->confirmed_at);
        $this->assertNull($reponse->confirmed_by_id);
        $this->assertSame(0, RadarConsent::query()->valid()->count());
        $this->assertSame(RadarListingStage::Contacted, $this->annonce->fresh()->stage);
        $this->assertNull($this->message->fresh()->outcome);
        // La vérification part en file, sur la file des appels IA.
        Bus::assertDispatched(VerifyRadarConsentReply::class, fn (VerifyRadarConsentReply $job) => $job->replyId === $reponse->id && $job->queue === 'ai');
    }

    public function test_ac2_un_bouton_du_gabarit_vaut_un_texte(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $bouton = ['from' => '221741234567', 'id' => 'wamid.BOUTON-1', 'timestamp' => '1793354400', 'type' => 'button',
            'button' => ['text' => 'OUI', 'payload' => 'OUI'], 'context' => ['from' => '221740000000', 'id' => 'wamid.ENVOYE-1']];

        $this->recevoir($this->corps([$bouton]))->assertOk();

        $this->assertSame('Annonceur : OUI', RadarConsent::query()->sole()->transcript);
    }

    public function test_ac2_sans_contexte_la_reponse_va_au_dernier_message_envoye_par_l_api_a_ce_numero_et_jamais_a_un_message_manuel(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        Carbon::setTestNow('2026-10-31 10:00:00');
        // Plus récent, mais manuel : parti d'un autre téléphone, une réponse au numéro du Radar ne s'y rattache pas.
        RadarOutreach::factory()->withListings($this->annonce)->sent()->create(['radar_advertiser_id' => $this->annonceur->id]);

        $this->recevoir($this->corps([$this->texte('oui', contexte: null)]))->assertOk();

        $this->assertSame($this->message->id, RadarConsent::query()->sole()->radar_outreach_id);
    }

    public function test_ac2_une_reponse_au_message_relance_va_a_la_derniere_relance_envoyee(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $relance = RadarOutreach::factory()->followUpOf($this->message)->withListings($this->annonce)->sent()->create([
            'channel' => RadarOutreachChannel::WhatsappCloud, 'provider_message_id' => 'wamid.RELANCE-1',
        ]);

        $this->recevoir($this->corps([$this->texte('OUI', contexte: 'wamid.ENVOYE-1')]))->assertOk();

        $this->assertSame($relance->id, RadarConsent::query()->sole()->radar_outreach_id);
    }

    public function test_ac2_un_vocal_est_garde_comme_reponse_mais_sa_verification_echoue_d_emblee(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $vocal = ['from' => '221741234567', 'id' => 'wamid.VOCAL-1', 'timestamp' => '1793354400', 'type' => 'audio', 'audio' => ['id' => 'media-1', 'mime_type' => 'audio/ogg']];

        $this->recevoir($this->corps([$vocal]))->assertOk();

        $reponse = RadarConsent::query()->sole();
        $this->assertSame('Annonceur : [audio]', $reponse->transcript);
        $this->assertSame(RadarVerificationStatus::Failed, $reponse->verification_status);
        $this->assertSame(VerifyRadarConsentReply::REASON_NO_TEXT, $reponse->verification_reason);
        Bus::assertNotDispatched(VerifyRadarConsentReply::class);
    }

    public function test_un_numero_inconnu_ou_un_annonceur_qui_a_dit_stop_ne_laisse_rien(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);

        $this->recevoir($this->corps([$this->texte('Bonjour', 'wamid.INCONNU-1', null, '221749999999')]))->assertOk();
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();
        $this->recevoir($this->corps([$this->texte('OUI', 'wamid.RECU-2')]))->assertOk();

        $this->assertSame(0, RadarConsent::query()->count());
        Bus::assertNotDispatched(VerifyRadarConsentReply::class);
    }

    // --- I-1 : le STOP reçu --------------------------------------------------------------------------

    /** I-1 (a) — le droit d'opposition « en répondant STOP » n'attend pas qu'un opérateur lise la réponse. */
    public function test_un_stop_recu_revoque_l_annonceur_des_la_reception(): void
    {
        Bus::fake([VerifyRadarConsentReply::class, PurgeRadarAdvertiser::class]);

        $this->recevoir($this->corps([$this->texte(' Stop. ', 'wamid.STOP-1')]))->assertOk();

        $this->assertNotNull($this->annonceur->fresh()->do_not_contact_at);
        $this->assertSame(RadarListingStage::DoNotContact, $this->annonce->fresh()->stage);
        $message = $this->message->fresh();
        $this->assertSame(RadarOutreachOutcome::Stop, $message->outcome);
        $this->assertNull($message->outcome_by_id);
        $this->assertSame(0, RadarConsent::query()->count());
        Bus::assertNotDispatched(VerifyRadarConsentReply::class);
        Bus::assertDispatched(PurgeRadarAdvertiser::class, fn (PurgeRadarAdvertiser $job): bool => $job->advertiserId === $this->annonceur->id);
        $journal = Activity::query()->where('event', 'radar_stop_received')->sole();
        $this->assertSame('wamid.STOP-1', $journal->properties['provider_message_id']);
        $this->assertSame(1, IntegrationWebhookLog::query()->sole()->matched_count);

        // Rejoué par Meta : rien de plus, la première date reste.
        $date = $this->annonceur->fresh()->do_not_contact_at;
        $this->recevoir($this->corps([$this->texte('STOP', 'wamid.STOP-1')]))->assertOk();
        $this->assertEquals($date, $this->annonceur->fresh()->do_not_contact_at);
        $this->assertSame(1, Activity::query()->where('event', 'radar_stop_received')->count());
    }

    /** Exactement STOP, aux espaces, à la casse et à la ponctuation finale près ; tout autre texte reste une réponse à trancher. */
    public function test_seul_un_texte_qui_vaut_exactement_stop_est_un_stop(): void
    {
        foreach (['STOP', 'Stop.', 'stop !', '  sToP  ', 'STOP!!', 'Stop…'] as $texte) {
            $this->assertTrue(RadarWhatsappInbox::isStop($texte), $texte);
        }
        foreach (['STOP svp', 'Non merci, stop', 'stopper', 'Arrêtez', 'S T O P', '.stop', 'OUI'] as $texte) {
            $this->assertFalse(RadarWhatsappInbox::isStop($texte), $texte);
        }

        Bus::fake([VerifyRadarConsentReply::class, PurgeRadarAdvertiser::class]);
        $this->recevoir($this->corps([$this->texte('Non merci, stop', 'wamid.NON-1')]))->assertOk();

        $this->assertNull($this->annonceur->fresh()->do_not_contact_at);
        $this->assertSame(RadarVerificationStatus::Pending, RadarConsent::query()->sole()->verification_status);
        Bus::assertNotDispatched(PurgeRadarAdvertiser::class);
    }

    /** `radar_whatsapp.auto_stop = false` : le STOP redevient une réponse que l'opérateur tranche. */
    public function test_sans_auto_stop_un_stop_reste_une_reponse_a_trancher(): void
    {
        Bus::fake([VerifyRadarConsentReply::class, PurgeRadarAdvertiser::class]);
        config(['radar_whatsapp.auto_stop' => false]);

        $this->recevoir($this->corps([$this->texte('STOP', 'wamid.STOP-2')]))->assertOk();

        $this->assertNull($this->annonceur->fresh()->do_not_contact_at);
        $this->assertSame('Annonceur : STOP', RadarConsent::query()->sole()->transcript);
        Bus::assertNotDispatched(PurgeRadarAdvertiser::class);
    }

    /** Banc de la vérification (B1) : après un STOP reçu, aucune relance ne part par l'API. */
    public function test_apres_un_stop_recu_aucune_relance_ne_part_par_l_api(): void
    {
        Bus::fake([VerifyRadarConsentReply::class, PurgeRadarAdvertiser::class]);
        config(['radar_whatsapp.driver' => 'cloud', 'radar_whatsapp.access_token' => 'jeton-radar', 'whatsapp.base_uri' => 'https://graph.exemple.test/v21.0']);
        $this->recevoir($this->corps([$this->texte('STOP', 'wamid.STOP-3')]))->assertOk();

        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->assertSame([], $this->app->make(RadarFollowUps::class)->due()->pluck('id')->all());
        $relance = RadarOutreach::factory()->followUpOf($this->message)->withListings($this->annonce)->create([
            'clauses_version' => ConsentMessageComposer::CLAUSES_VERSION, 'salutation' => 'Bonjour Awa,', 'summary' => 'votre appartement à Ouakam', 'message' => 'x',
            'created_by_id' => $this->operateur->id,
        ]);
        Http::fake();
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim");

        $this->postJson("/api/admin/radar/outreaches/{$relance->id}/send")->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');
        Http::assertNothingSent();
    }

    // --- AC3 : le webhook -------------------------------------------------------------------------

    public function test_ac3_un_jeton_d_url_faux_rend_404_et_laisse_une_ligne_rejetee_sans_corps(): void
    {
        $this->recevoir($this->corps([$this->texte('OUI')]), jeton: 'faux')->assertNotFound();

        $ligne = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_REJECTED, $ligne->status);
        $this->assertSame('whatsapp_cloud_radar', $ligne->provider);
        $this->assertNull($ligne->authenticated_at);
        $this->assertNull($ligne->getAttributes()['body']);
        $this->assertSame(0, RadarConsent::query()->count());
    }

    public function test_ac3_une_signature_fausse_ou_absente_ou_un_secret_vide_rend_403(): void
    {
        $this->recevoir($this->corps([$this->texte('OUI')]), secret: 'autre-secret')->assertForbidden()->assertJsonPath('code', 'webhook.signature_invalid');
        $this->recevoir($this->corps([$this->texte('OUI')]), signature: '')->assertForbidden()->assertJsonPath('code', 'webhook.signature_invalid');
        // Le secret des NOTIFICATIONS ne signe pas un webhook du Radar.
        config(['whatsapp.webhook_app_secret' => 'secret-notifications']);
        $this->recevoir($this->corps([$this->texte('OUI')]), secret: 'secret-notifications')->assertForbidden();
        config(['radar_whatsapp.webhook_app_secret' => '']);
        $this->recevoir($this->corps([$this->texte('OUI')]), secret: '')->assertForbidden()->assertJsonPath('code', 'webhook.signature_not_configured');

        $this->assertSame(0, RadarConsent::query()->count());
        $this->assertSame(4, IntegrationWebhookLog::query()->where('status', IntegrationWebhookLog::STATUS_REJECTED)->count());
    }

    public function test_ac3_la_ligne_du_journal_est_ecrite_authentifiee_et_sa_vue_ne_garde_ni_le_texte_ni_le_numero(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);

        $this->recevoir($this->corps([$this->texte('OUI je suis d accord')]))->assertOk();

        $ligne = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_PROCESSED, $ligne->status);
        $this->assertSame('whatsapp', $ligne->channel);
        $this->assertSame('whatsapp_cloud_radar', $ligne->provider);
        $this->assertSame('whatsapp.webhook.radar', $ligne->route_name);
        $this->assertNotNull($ligne->authenticated_at);
        $this->assertSame('wamid.RECU-1', $ligne->external_id);
        $this->assertSame(1, $ligne->matched_count);
        $vue = json_encode($ligne->payload);
        $this->assertStringContainsString('wamid.RECU-1', $vue);
        $this->assertStringNotContainsString('accord', $vue);
        $this->assertStringNotContainsString('741234567', $vue);
    }

    public function test_ac3_le_meme_identifiant_recu_deux_fois_ne_cree_qu_une_reponse(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);

        $this->recevoir($this->corps([$this->texte('OUI')]))->assertOk();
        $this->recevoir($this->corps([$this->texte('OUI')]))->assertOk();

        $this->assertSame(1, RadarConsent::query()->count());
        Bus::assertDispatchedTimes(VerifyRadarConsentReply::class, 1);
        $this->assertSame([1, 0], IntegrationWebhookLog::query()->orderBy('id')->pluck('matched_count')->all());
    }

    public function test_ac3_un_message_adresse_a_un_autre_numero_que_celui_du_radar_n_est_pas_lu(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);

        $this->recevoir($this->corps([$this->texte('OUI')], numero: 'NOTIF-111'))->assertOk();
        config(['radar_whatsapp.phone_number_id' => '']);
        $this->recevoir($this->corps([$this->texte('OUI')], numero: ''))->assertOk();

        $this->assertSame(0, RadarConsent::query()->count());
    }

    /**
     * I-2 — le corps chiffré d'une ligne du Radar garde le texte, le numéro et le nom de profil de quiconque écrit, tiers
     * inconnus compris : il est effacé à la clôture, quelle que soit l'issue (appariée, non appariée, échouée), et la
     * ligne ne se rejoue pas. Le contrôle porte sur `body`, pas seulement sur la vue expurgée.
     */
    public function test_ac3_le_corps_d_une_ligne_du_radar_est_efface_a_la_cloture_quelle_que_soit_l_issue(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);

        $this->recevoir($this->corps([$this->texte('OUI je suis d accord')]))->assertOk();
        $this->recevoir($this->corps([$this->texte('Mon secret personnel', 'wamid.TIERS-1', null, '221749998877')]))->assertOk();
        // Une panne pendant le traitement : la ligne échoue, son corps part quand même.
        RadarConsent::creating(fn () => throw new RuntimeException('panne'));
        $this->recevoir($this->corps([$this->texte('OUI', 'wamid.RECU-3')]))->assertServerError();

        $lignes = IntegrationWebhookLog::query()->orderBy('id')->get();
        $this->assertSame([IntegrationWebhookLog::STATUS_PROCESSED, IntegrationWebhookLog::STATUS_PROCESSED, IntegrationWebhookLog::STATUS_FAILED], $lignes->pluck('status')->all());
        $this->assertSame([1, 0], $lignes->take(2)->pluck('matched_count')->all());
        foreach ($lignes as $ligne) {
            $this->assertNotNull($ligne->authenticated_at);
            $this->assertNull(DB::table('integration_webhook_logs')->where('id', $ligne->id)->value('body'));
            $this->assertFalse($ligne->isReplayable());
            $this->assertFalse(IntegrationWebhookLog::query()->select(['id', 'provider', 'status', 'matched_count', 'authenticated_at', 'body_truncated'])->find($ligne->id)->isReplayable());
        }
        try {
            app(WebhookReplayer::class)->replay($lignes[1], $this->operateur);
            $this->fail('Une ligne du Radar ne se rejoue pas.');
        } catch (ApiError $refus) {
            $this->assertSame('webhook_log.not_replayable', $refus->errorCode);
        }
    }

    public function test_ac3_la_verification_d_abonnement_rend_le_defi_sous_le_jeton_du_radar_seul(): void
    {
        $url = '/api/webhooks/whatsapp/radar/'.self::JETON.'?hub.mode=subscribe&hub.challenge=defi-42&hub.verify_token=';

        $this->get($url.'jeton-verification-radar')->assertOk()->assertSeeText('defi-42');
        config(['whatsapp.webhook_verify_token' => 'jeton-verification-notifications']);
        $this->get($url.'jeton-verification-notifications')->assertForbidden();
        $this->get('/api/webhooks/whatsapp/radar/faux?hub.mode=subscribe&hub.challenge=x&hub.verify_token=jeton-verification-radar')->assertNotFound();
    }

    // --- AC5 : la vérification d'une réponse texte -----------------------------------------------

    public function test_ac5_la_reponse_texte_se_verifie_sur_raisonnement_et_le_code_juge_le_numero_et_les_clauses(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $this->recevoir($this->corps([$this->texte('OUI')]))->assertOk();
        $reponse = RadarConsent::query()->sole();
        $recu = null;
        $pieces = null;
        RadarConsentVerification::fake(function (string $prompt, Collection $attachments) use (&$recu, &$pieces) {
            $recu = $prompt;
            $pieces = $attachments->count();

            return $this->sortie();
        });

        $this->lancer($reponse)->assertNotReleased();

        $reponse->refresh();
        $this->assertSame(RadarVerificationStatus::Done, $reponse->verification_status);
        $this->assertSame('Annonceur : OUI', $reponse->transcript);
        $verdict = $reponse->ai_verdict;
        $this->assertSame('consent', $verdict['classification']);
        $this->assertTrue($verdict['number_matches']);
        $this->assertSame('code', $verdict['number_checked_by']);
        $this->assertSame([1, 2, 3, 4], $verdict['clauses_found']);
        $this->assertTrue($verdict['clauses_complete']);
        $this->assertSame([], $verdict['discordances']);
        $this->assertNull($reponse->confirmed_at);
        // Ce que reçoit le modèle : le message envoyé exact et le texte reçu délimité, sans capture ni numéro.
        $this->assertSame(0, $pieces);
        $this->assertStringContainsString($this->message->message, (string) $recu);
        $this->assertStringContainsString('source="message"', (string) $recu);
        $this->assertStringNotContainsString('Numéro attendu', (string) $recu);
        $appel = AiCall::query()->sole();
        $this->assertSame(AiModelRole::Raisonnement, $appel->role);
        $this->assertSame(2, (int) $appel->prompt_version);
        $this->assertSame($this->operateur->id, $appel->actor_id);
    }

    public function test_ac5_un_oui_classe_accord_se_confirme_sans_motif_par_l_operateur(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $this->recevoir($this->corps([$this->texte('OUI')]))->assertOk();
        RadarConsentVerification::fake([$this->sortie()]);
        $this->lancer(RadarConsent::query()->sole());
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();

        $this->postJson("/api/admin/radar/outreaches/{$this->message->id}/outcome", ['outcome' => 'consented'])
            ->assertOk()->assertJsonPath('data.outcome', 'consented');

        $reponse = RadarConsent::query()->sole();
        $this->assertSame($this->operateur->id, $reponse->confirmed_by_id);
        $this->assertNull($reponse->confirmation_reason);
        $this->assertSame(RadarListingStage::Consented, $this->annonce->fresh()->stage);
    }

    public function test_ac5_une_reponse_classee_autrement_qu_accord_exige_un_motif_pour_etre_confirmee(): void
    {
        Bus::fake([VerifyRadarConsentReply::class]);
        $this->recevoir($this->corps([$this->texte('on verra')]))->assertOk();
        RadarConsentVerification::fake([$this->sortie(['classification' => 'ambiguous', 'reply_text' => 'on verra'])]);
        $this->lancer(RadarConsent::query()->sole());
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();

        $this->postJson("/api/admin/radar/outreaches/{$this->message->id}/outcome", ['outcome' => 'consented'])
            ->assertStatus(422)->assertJsonPath('code', 'radar.consent.reason_required');

        $this->assertSame(['not_consent'], RadarConsent::query()->sole()->ai_verdict['discordances']);
        $this->assertNull(RadarConsent::query()->sole()->confirmed_at);
    }
}
