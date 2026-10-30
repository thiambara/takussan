<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarConsentMessage;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\Integration;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\Whatsapp\RadarWhatsappTemplate;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2395 (ADR-0077 §5, AC1, AC4, AC6) — envoyer un message d'accord par l'API, depuis le numéro WhatsApp DÉDIÉ au Radar.
 * Aucun réseau : `Http::fake()`, et le pilote `log` par défaut n'appelle rien.
 *
 * AC1 se prouve par ce qui part sur le fil : sans numéro du Radar, ou avec celui des notifications, AUCUNE requête ; configuré,
 * une seule, vers l'identifiant et avec le jeton du Radar — jamais ceux de l'intégration `whatsapp_cloud` des notifications.
 */
class RadarWhatsappOutreachTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const NUMERO = '+221741234567';

    private const NUMERO_NOTIFICATIONS = 'NOTIF-111';

    private const NUMERO_RADAR = 'RADAR-222';

    private User $operateur;

    private RadarAdvertiser $annonceur;

    private RadarListing $annonce;

    private RadarOutreach $message;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-30 10:00:00');
        config([
            'app.frontend_url' => 'https://front.exemple.test',
            'whatsapp.base_uri' => 'https://graph.exemple.test/v21.0',
        ]);
        // Le numéro des notifications est configuré, comme en production : il ne doit jamais servir.
        Integration::factory()->create([
            'provider' => 'whatsapp_cloud',
            'agency_id' => null,
            'credentials' => ['phone_number_id' => self::NUMERO_NOTIFICATIONS, 'access_token' => 'jeton-notifications'],
        ]);

        $this->operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Fall']);
        $this->annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id]);
        $this->message = $this->prepare();
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Un message préparé dans la version courante des clauses, composé comme `RadarOutreachWorkflow::prepare()` le compose. */
    private function prepare(string $salutation = 'Bonjour Awa,', string $resume = 'votre appartement à Ouakam', string $locale = 'fr', array $attributs = []): RadarOutreach
    {
        $composer = $this->app->make(ConsentMessageComposer::class);
        $message = RadarOutreach::factory()->withListings($this->annonce)->create($attributs + [
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => ConsentMessageComposer::CLAUSES_VERSION, 'locale' => $locale,
            'salutation' => $salutation, 'summary' => $resume, 'message' => '', 'created_by_id' => $this->operateur->id,
        ]);
        $message->forceFill(['message' => $composer->compose($locale, $salutation, $resume, ConsentMessageComposer::CLAUSES_VERSION, $composer->claimUrlFor($message->load('advertiser')))])->save();

        return $message->refresh();
    }

    private function configurerLeRadar(array $surcharge = []): void
    {
        config($surcharge + [
            'radar_whatsapp.driver' => 'cloud',
            'radar_whatsapp.phone_number_id' => self::NUMERO_RADAR,
            'radar_whatsapp.access_token' => 'jeton-radar',
        ]);
    }

    private function envoyer(?RadarOutreach $message = null): TestResponse
    {
        return $this->postJson('/api/admin/radar/outreaches/'.($message ?? $this->message)->id.'/send');
    }

    private function metaAccepte(string $wamid = 'wamid.RADAR-1'): void
    {
        Http::fake(['graph.exemple.test/*' => Http::response(['messages' => [['id' => $wamid]]])]);
    }

    private function assertEncorePrepare(): void
    {
        $frais = $this->message->fresh();
        $this->assertNull($frais->sent_at);
        $this->assertNull($frais->provider_message_id);
        $this->assertSame(RadarOutreachChannel::WhatsappManual, $frais->channel);
        $this->assertSame(RadarListingStage::Reviewed, $this->annonce->fresh()->stage);
    }

    public function test_ac1_sans_numero_du_radar_rien_ne_part_meme_quand_celui_des_notifications_est_configure(): void
    {
        Http::fake();
        config(['radar_whatsapp.driver' => 'cloud', 'radar_whatsapp.phone_number_id' => '', 'radar_whatsapp.access_token' => '']);

        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.not_configured');

        Http::assertNothingSent();
        $this->assertEncorePrepare();
    }

    public function test_ac1_un_numero_du_radar_egal_a_celui_des_notifications_est_refuse_sans_requete(): void
    {
        Http::fake();
        $this->configurerLeRadar(['radar_whatsapp.phone_number_id' => self::NUMERO_NOTIFICATIONS]);

        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.same_number');

        Http::assertNothingSent();
        $this->assertEncorePrepare();
    }

    public function test_ac1_le_numero_d_une_integration_des_notifications_inactive_ou_d_agence_est_refuse_aussi(): void
    {
        Http::fake();
        Integration::factory()->create([
            'provider' => 'whatsapp_cloud', 'is_active' => false,
            'credentials' => ['phone_number_id' => 'AGENCE-333', 'access_token' => 'jeton-agence'],
        ]);
        $this->configurerLeRadar(['radar_whatsapp.phone_number_id' => 'AGENCE-333']);

        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.same_number');

        Http::assertNothingSent();
    }

    public function test_ac1_ac4_configure_une_seule_requete_part_vers_le_numero_et_avec_le_jeton_du_radar(): void
    {
        $this->configurerLeRadar();
        $this->metaAccepte();

        $this->envoyer()->assertOk()
            ->assertJsonPath('data.status', 'sent')
            ->assertJsonPath('data.channel', 'whatsapp_cloud')
            ->assertJsonPath('data.provider_status', 'accepted')
            ->assertJsonMissingPath('data.provider_message_id');

        Http::assertSentCount(1);
        Http::assertSent(function (Request $request): bool {
            return $request->url() === 'https://graph.exemple.test/v21.0/'.self::NUMERO_RADAR.'/messages'
                && $request->hasHeader('Authorization', 'Bearer jeton-radar')
                && $request['to'] === '221741234567'
                && $request['type'] === 'template'
                && $request['template']['name'] === 'takussan_radar_accord_v3'
                && $request['template']['language']['code'] === 'fr';
        });
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), self::NUMERO_NOTIFICATIONS)
            || $request->hasHeader('Authorization', 'Bearer jeton-notifications'));

        $frais = $this->message->fresh();
        $this->assertNotNull($frais->sent_at);
        $this->assertSame($this->operateur->id, $frais->sent_by_id);
        $this->assertSame(RadarOutreachChannel::WhatsappCloud, $frais->channel);
        $this->assertSame('wamid.RADAR-1', $frais->provider_message_id);
        $this->assertSame(RadarListingStage::Contacted, $this->annonce->fresh()->stage);

        $journal = Activity::query()->where('event', 'radar_outreach_sent')->sole();
        $this->assertSame('whatsapp_cloud', $journal->properties['channel']);
        $this->assertStringNotContainsString(self::NUMERO, $journal->properties->toJson());
        $this->assertStringNotContainsString('Ouakam', $journal->properties->toJson());
    }

    /** AC4 — ce que l'annonceur lit est le texte enregistré : le corps du gabarit, ses paramètres substitués, redonne `message`. */
    public function test_ac4_les_parametres_envoyes_substitues_dans_le_corps_du_gabarit_redonnent_exactement_le_message(): void
    {
        $this->configurerLeRadar();
        $this->metaAccepte();

        $this->envoyer()->assertOk();

        $envoye = Http::recorded()->first()[0];
        $params = array_column($envoye['template']['components'][0]['parameters'], 'text');
        $this->assertCount(4, $params);
        $corps = $this->app->make(RadarWhatsappTemplate::class)->body('fr', 'accord.v3');
        $this->assertSame($this->message->message, RadarWhatsappTemplate::render($corps, $params));
        // Les clauses ne sont jamais des paramètres : elles sont dans le corps approuvé.
        foreach ($params as $param) {
            $this->assertStringNotContainsString('vous nous autorisez', $param);
            $this->assertStringNotContainsString("\n", $param);
        }
    }

    public function test_ac4_un_message_dont_le_texte_ne_se_recompose_pas_est_refuse_avant_tout_envoi(): void
    {
        $this->configurerLeRadar();
        Http::fake();
        $this->message->forceFill(['message' => $this->message->message.' (texte retouché ailleurs)'])->save();

        $this->envoyer()->assertStatus(409)->assertJsonPath('code', 'radar.whatsapp.message_mismatch');

        Http::assertNothingSent();
    }

    /** `accord.v1` n'a jamais été soumise ; `accord.v2` s'ouvre sur `{{1}}`, que Meta refuse : aucune n'a de gabarit. */
    public function test_ac4_une_version_de_clauses_sans_gabarit_approuve_ne_s_envoie_pas_par_l_api(): void
    {
        $this->configurerLeRadar();
        Http::fake();
        foreach (['accord.v1', 'accord.v2'] as $version) {
            $this->message->forceFill(['clauses_version' => $version])->save();

            $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.template_missing');
        }

        Http::assertNothingSent();
    }

    public function test_ac4_un_refus_franc_de_meta_n_ecrit_rien(): void
    {
        $this->configurerLeRadar();
        Http::fake(['graph.exemple.test/*' => Http::response(['error' => ['code' => 132001, 'message' => 'Template does not exist']], 400)]);

        $this->envoyer()->assertStatus(502)->assertJsonPath('code', 'radar.whatsapp.send_failed');

        $this->assertEncorePrepare();
        $this->assertSame(0, Activity::query()->where('event', 'radar_outreach_sent')->count());
    }

    public function test_ac4_un_echec_ambigu_marque_envoye_sans_identifiant_pour_ne_jamais_ecrire_deux_fois(): void
    {
        $this->configurerLeRadar();
        Http::fake(['graph.exemple.test/*' => fn () => throw new ConnectionException('cURL error 28: Operation timed out')]);

        $this->envoyer()->assertOk()->assertJsonPath('data.status', 'sent')->assertJsonPath('data.provider_status', 'ambiguous');

        $frais = $this->message->fresh();
        $this->assertNotNull($frais->sent_at);
        $this->assertNull($frais->provider_message_id);
        $this->assertSame(RadarListingStage::Contacted, $this->annonce->fresh()->stage);

        // Un second envoi est le refus de « J'ai envoyé » sur un message déjà parti.
        Http::fake();
        $this->envoyer()->assertStatus(409)->assertJsonPath('code', 'radar.outreach.not_prepared');
        Http::assertNothingSent();
    }

    public function test_ac4_les_regles_de_j_ai_envoye_s_appliquent_avant_tout_envoi(): void
    {
        $this->configurerLeRadar();
        Http::fake();
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();

        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');

        Http::assertNothingSent();
    }

    public function test_ac4_sans_prise_en_charge_rien_ne_part(): void
    {
        $this->configurerLeRadar();
        Http::fake();
        $this->deleteJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertNoContent();

        $this->envoyer()->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');

        Http::assertNothingSent();
        $this->assertEncorePrepare();
    }

    public function test_ac6_le_pilote_par_defaut_n_appelle_aucun_reseau_et_rend_un_identifiant_fictif(): void
    {
        Http::fake();
        $this->assertSame('log', config('radar_whatsapp.driver'));

        $this->envoyer()->assertOk()->assertJsonPath('data.channel', 'whatsapp_cloud');

        Http::assertNothingSent();
        $this->assertStringStartsWith('wamid.log_', (string) $this->message->fresh()->provider_message_id);
    }

    /** Le corps à soumettre à Meta : le fichier de clauses du dépôt, ses marqueurs numérotés dans l'ordre, rien d'autre. */
    public function test_la_commande_imprime_le_corps_du_gabarit_a_soumettre_a_meta(): void
    {
        $corps = $this->app->make(RadarWhatsappTemplate::class)->body('fr', 'accord.v3');
        $clauses = (string) file_get_contents(resource_path('radar/clauses/accord.v3.fr.md'));

        $this->assertSame(rtrim(str_replace(['{salutation}', '{resume}', '{lien_reclamation}', '{lien_conditions}'], ['{{1}}', '{{2}}', '{{3}}', '{{4}}'], $clauses), "\n"), $corps);
        $this->artisan('radar:whatsapp-template', ['locale' => 'fr'])
            ->expectsOutputToContain('takussan_radar_accord_v3')
            ->expectsOutputToContain('Conditions : {{4}}')
            ->assertSuccessful();
        $this->artisan('radar:whatsapp-template', ['locale' => 'wo'])->assertFailed();
    }

    /** I-4 — Meta refuse un corps qui commence ou finit par une variable : celui de la version courante s'ouvre et se ferme sur du texte. */
    public function test_ac4_le_corps_de_la_version_courante_ne_commence_ni_ne_finit_par_une_variable(): void
    {
        $gabarit = $this->app->make(RadarWhatsappTemplate::class);
        foreach (ConsentMessageComposer::LOCALES as $locale) {
            $corps = $gabarit->body($locale);

            $this->assertStringStartsWith('Takussan — {{1}}', $corps, $locale);
            $this->assertDoesNotMatchRegularExpression('/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/', $corps, $locale);
            $this->assertArrayHasKey(ConsentMessageComposer::CLAUSES_VERSION, config('radar_whatsapp.templates'));
            // Les clauses d'`accord.v3` sont celles d'`accord.v2` mot pour mot : seule l'ouverture change.
            $v2 = (string) file_get_contents(resource_path("radar/clauses/accord.v2.{$locale}.md"));
            $v3 = (string) file_get_contents(resource_path("radar/clauses/accord.v3.{$locale}.md"));
            $this->assertSame('Takussan — '.$v2, $v3, $locale);
        }
    }

    /**
     * I-4 — le corps hydraté reste sous 1024 caractères (au-delà, Meta refuse : 132005) avec la salutation et le résumé les plus
     * longs permis, l'origine réelle la plus longue du front et l'identifiant d'annonceur le plus long.
     */
    public function test_ac4_le_corps_hydrate_reste_sous_la_limite_de_meta_avec_les_parties_et_les_liens_les_plus_longs(): void
    {
        $this->configurerLeRadar();
        config(['app.frontend_url' => 'https://preview.takussan.com']);
        $this->annonceur = RadarAdvertiser::factory()->create(['id' => PHP_INT_MAX, 'phone' => '+221749998877']);
        $this->annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => PHP_INT_MAX]);

        foreach (ConsentMessageComposer::LOCALES as $locale) {
            $message = $this->prepare(str_repeat('S', ConsentMessageComposer::SALUTATION_MAX), str_repeat('r', RadarWhatsappTemplate::SUMMARY_MAX), $locale, ['radar_advertiser_id' => PHP_INT_MAX]);
            $parametres = $this->app->make(RadarWhatsappTemplate::class)->for($message)->params;

            $this->assertSame($message->message, RadarWhatsappTemplate::render($this->app->make(RadarWhatsappTemplate::class)->body($locale), $parametres));
            $this->assertLessThanOrEqual(RadarWhatsappTemplate::BODY_MAX, mb_strlen($message->message), $locale);
        }
    }

    /** I-4 — un résumé plus long que la borne du canal API est refusé avant tout envoi : l'opérateur le raccourcit. */
    public function test_ac4_un_resume_trop_long_pour_l_api_est_refuse_avant_tout_envoi(): void
    {
        $this->configurerLeRadar();
        Http::fake();
        $message = $this->prepare('Bonjour Awa,', str_repeat('r', RadarWhatsappTemplate::SUMMARY_MAX + 1));

        $this->envoyer($message)->assertStatus(422)
            ->assertJsonPath('code', 'radar.whatsapp.summary_too_long')
            ->assertJsonPath('params.max', RadarWhatsappTemplate::SUMMARY_MAX);

        Http::assertNothingSent();
        $this->assertNull($message->fresh()->sent_at);
    }

    /** m-1 — une intégration des notifications supprimée garde son numéro : la recréer le rendrait aux baux. */
    public function test_ac1_le_numero_d_une_integration_des_notifications_supprimee_est_refuse_aussi(): void
    {
        Http::fake();
        Integration::factory()->create([
            'provider' => 'whatsapp_cloud',
            'credentials' => ['phone_number_id' => 'SUPPRIME-444', 'access_token' => 'jeton-supprime'],
        ])->delete();
        $this->configurerLeRadar(['radar_whatsapp.phone_number_id' => 'SUPPRIME-444']);

        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.same_number');

        Http::assertNothingSent();
    }

    /** m-2 — un même jeton désigne la même application Meta, donc le même compte : un autre identifiant ne suffit pas. */
    public function test_ac1_le_jeton_des_notifications_est_refuse_meme_avec_un_autre_numero(): void
    {
        Http::fake();
        $this->configurerLeRadar(['radar_whatsapp.access_token' => 'jeton-notifications']);

        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.same_number');

        Http::assertNothingSent();
        $this->assertEncorePrepare();
    }

    /** I-3 — hors `local` et `testing`, le pilote `log` « réussirait » sans rien envoyer : le message ne pourrait plus partir. */
    public function test_le_pilote_log_est_refuse_hors_local_et_testing(): void
    {
        Http::fake();
        $this->app['env'] = 'production';

        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.not_configured');

        Http::assertNothingSent();
        $this->assertEncorePrepare();
    }

    /** I-3 — la fiche dit au front si l'envoi par l'API est possible ici (TCK-2426 n'offre le bouton qu'alors). */
    public function test_la_fiche_dit_si_l_envoi_par_l_api_est_possible(): void
    {
        $disponible = fn (): mixed => $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}")->assertOk()->json('data.whatsapp_api_available');

        $this->assertTrue($disponible(), 'pilote log en testing');
        $this->configurerLeRadar();
        $this->assertTrue($disponible(), 'pilote cloud configuré');
        config(['radar_whatsapp.access_token' => '']);
        $this->assertFalse($disponible(), 'pilote cloud sans jeton');
        config(['radar_whatsapp.driver' => 'log']);
        $this->app['env'] = 'production';
        $this->assertFalse($disponible(), 'pilote log en production');
    }

    /**
     * I-1 (b), I-5 — une réponse reçue par l'API et non tranchée (un STOP mal écrit, une question) arrête l'envoi d'une
     * relance, par l'API comme par « J'ai envoyé » : l'écran ne la montre pas encore (TCK-2426).
     */
    public function test_une_reponse_recue_non_tranchee_arrete_la_relance_par_l_api(): void
    {
        $this->configurerLeRadar();
        $this->message->forceFill(['sent_at' => now(), 'sent_by_id' => $this->operateur->id, 'channel' => RadarOutreachChannel::WhatsappCloud, 'provider_message_id' => 'wamid.ENVOYE-1'])->save();
        $this->annonce->forceFill(['stage' => RadarListingStage::Contacted])->save();
        RadarConsent::query()->create([
            'radar_outreach_id' => $this->message->id, 'radar_advertiser_id' => $this->annonceur->id,
            'proof' => RadarConsentProof::ProviderMessage, 'provider_message_id' => 'wamid.REPONSE-1',
            'transcript' => 'Annonceur : arrêtez svp', 'verification_status' => RadarVerificationStatus::Done,
        ]);
        Carbon::setTestNow('2026-11-15 10:00:00');
        $relance = $this->prepare('Bonjour Awa,', 'votre appartement à Ouakam', 'fr', ['follow_up_of_id' => $this->message->id, 'follow_up_rank' => 1]);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
        Http::fake();

        $this->envoyer($relance)->assertStatus(409)->assertJsonPath('code', 'radar.outreach.reply_pending');

        Http::assertNothingSent();
        $this->assertNull($relance->fresh()->sent_at);
    }

    /** I-5 — « J'ai envoyé » est arrêté de même par une réponse reçue non tranchée ; tranchée, la relance repart. */
    public function test_une_reponse_recue_non_tranchee_arrete_aussi_j_ai_envoye(): void
    {
        $this->message->forceFill(['sent_at' => now(), 'sent_by_id' => $this->operateur->id, 'channel' => RadarOutreachChannel::WhatsappCloud, 'provider_message_id' => 'wamid.ENVOYE-1'])->save();
        $this->annonce->forceFill(['stage' => RadarListingStage::Contacted])->save();
        $reponse = RadarConsent::query()->create([
            'radar_outreach_id' => $this->message->id, 'radar_advertiser_id' => $this->annonceur->id,
            'proof' => RadarConsentProof::ProviderMessage, 'provider_message_id' => 'wamid.REPONSE-1',
            'transcript' => 'Annonceur : Stop svp', 'verification_status' => RadarVerificationStatus::Pending,
        ]);
        Carbon::setTestNow('2026-11-15 10:00:00');
        $relance = $this->prepare('Bonjour Awa,', 'votre appartement à Ouakam', 'fr', ['follow_up_of_id' => $this->message->id, 'follow_up_rank' => 1]);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();

        $this->postJson("/api/admin/radar/outreaches/{$relance->id}/sent")->assertStatus(409)->assertJsonPath('code', 'radar.outreach.reply_pending');
        $this->assertNull($relance->fresh()->sent_at);

        // Une réponse confirmée n'attend plus rien : la garde ne la compte pas.
        $reponse->forceFill(['confirmed_at' => now(), 'confirmed_by_id' => $this->operateur->id])->save();
        $this->postJson("/api/admin/radar/outreaches/{$relance->id}/sent")->assertOk();
    }

    /**
     * TCK-2426 (I-1), ADR-0081 — une opposition probable vaut pour l'annonceur, pas pour une annonce : un « Stop svp » non
     * tranché sur l'annonce A arrête aussi un premier message sur l'annonce B — préparation, envoi par l'API, « J'ai envoyé ».
     */
    public function test_une_reponse_non_tranchee_sur_une_annonce_arrete_tout_envoi_vers_l_annonceur(): void
    {
        $this->configurerLeRadar();
        $this->message->forceFill(['sent_at' => now(), 'sent_by_id' => $this->operateur->id, 'channel' => RadarOutreachChannel::WhatsappCloud, 'provider_message_id' => 'wamid.ENVOYE-1'])->save();
        $this->annonce->forceFill(['stage' => RadarListingStage::Contacted])->save();
        $autre = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id]);
        // Préparé sur l'annonce B avant que la réponse n'arrive.
        $this->annonce = $autre;
        $premier = $this->prepare();
        RadarConsent::query()->create([
            'radar_outreach_id' => $this->message->id, 'radar_advertiser_id' => $this->annonceur->id,
            'proof' => RadarConsentProof::ProviderMessage, 'provider_message_id' => 'wamid.REPONSE-1',
            'transcript' => 'Annonceur : Stop svp', 'verification_status' => RadarVerificationStatus::Pending,
        ]);
        RadarConsentMessage::fake();
        Http::fake();

        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/outreaches", ['listing_ids' => [$autre->id], 'locale' => 'fr'])
            ->assertStatus(409)->assertJsonPath('code', 'radar.outreach.reply_pending');
        $this->envoyer($premier)->assertStatus(409)->assertJsonPath('code', 'radar.outreach.reply_pending');
        $this->postJson("/api/admin/radar/outreaches/{$premier->id}/sent")->assertStatus(409)->assertJsonPath('code', 'radar.outreach.reply_pending');

        RadarConsentMessage::assertNeverPrompted();
        Http::assertNothingSent();
        $this->assertNull($premier->fresh()->sent_at);
        $this->assertSame(RadarListingStage::Reviewed, $autre->fresh()->stage);
    }

    /** Le canal manuel pur, sans réponse reçue par l'API — une capture déposée en attente comprise —, reste libre. */
    public function test_sans_reponse_recue_par_l_api_le_canal_manuel_reste_libre(): void
    {
        $this->message->forceFill(['sent_at' => now(), 'sent_by_id' => $this->operateur->id])->save();
        $this->annonce->forceFill(['stage' => RadarListingStage::Contacted])->save();
        RadarConsent::query()->create([
            'radar_outreach_id' => $this->message->id, 'radar_advertiser_id' => $this->annonceur->id,
            'proof' => RadarConsentProof::Screenshot, 'transcript' => 'Annonceur : Stop svp',
            'verification_status' => RadarVerificationStatus::Pending,
        ]);
        $this->annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id]);
        $premier = $this->prepare();

        $this->postJson("/api/admin/radar/outreaches/{$premier->id}/sent")->assertOk();
        $this->assertSame(RadarListingStage::Contacted, $this->annonce->fresh()->stage);
    }

    /**
     * m-3 — Meta a accepté le message, puis une écriture défait la transaction : le message n'est pas laissé « préparé » (un
     * second clic l'enverrait de nouveau). Il est marqué envoyé, ambigu, avec l'identifiant de Meta, journalisé avant
     * toute écriture — et Meta n'est appelé qu'une fois.
     */
    public function test_une_ecriture_qui_echoue_apres_l_envoi_marque_le_message_envoye_et_ambigu(): void
    {
        $this->configurerLeRadar();
        $this->metaAccepte('wamid.RADAR-9');
        Log::spy();
        $panne = true;
        RadarListing::saving(function () use (&$panne): void {
            if ($panne) {
                $panne = false;
                throw new RuntimeException('connexion perdue');
            }
        });

        $this->envoyer()->assertOk()->assertJsonPath('data.status', 'sent')->assertJsonPath('data.provider_status', 'ambiguous');

        Http::assertSentCount(1);
        $frais = $this->message->fresh();
        $this->assertNotNull($frais->sent_at);
        $this->assertSame('wamid.RADAR-9', $frais->provider_message_id);
        $this->assertSame(RadarListingStage::Contacted, $this->annonce->fresh()->stage);
        Log::shouldHaveReceived('info')->withArgs(fn (string $ligne, array $contexte): bool => $contexte === ['outreach_id' => $this->message->id, 'provider_message_id' => 'wamid.RADAR-9'])->once();
        Log::shouldHaveReceived('error')->withArgs(fn (string $ligne, array $contexte): bool => ($contexte['provider_message_id'] ?? null) === 'wamid.RADAR-9')->once();
    }
}
