<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\Integration;
use App\Models\RadarAdvertiser;
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
use Illuminate\Testing\TestResponse;
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

    /** Un message préparé en `accord.v2`, composé comme `RadarOutreachWorkflow::prepare()` le compose. */
    private function prepare(string $salutation = 'Bonjour Awa,', string $resume = 'votre appartement à Ouakam'): RadarOutreach
    {
        $composer = $this->app->make(ConsentMessageComposer::class);
        $message = RadarOutreach::factory()->withListings($this->annonce)->create([
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => 'accord.v2',
            'salutation' => $salutation, 'summary' => $resume, 'message' => '', 'created_by_id' => $this->operateur->id,
        ]);
        $message->forceFill(['message' => $composer->compose('fr', $salutation, $resume, 'accord.v2', $composer->claimUrlFor($message->load('advertiser')))])->save();

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
                && $request['template']['name'] === 'takussan_radar_accord_v2'
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
        $corps = $this->app->make(RadarWhatsappTemplate::class)->body('fr', 'accord.v2');
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

    public function test_ac4_une_version_de_clauses_sans_gabarit_approuve_ne_s_envoie_pas_par_l_api(): void
    {
        $this->configurerLeRadar();
        Http::fake();
        $this->message->forceFill(['clauses_version' => 'accord.v1'])->save();

        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.whatsapp.template_missing');

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
        $corps = $this->app->make(RadarWhatsappTemplate::class)->body('fr', 'accord.v2');
        $clauses = (string) file_get_contents(resource_path('radar/clauses/accord.v2.fr.md'));

        $this->assertSame(rtrim(str_replace(['{salutation}', '{resume}', '{lien_reclamation}', '{lien_conditions}'], ['{{1}}', '{{2}}', '{{3}}', '{{4}}'], $clauses), "\n"), $corps);
        $this->artisan('radar:whatsapp-template', ['locale' => 'fr'])
            ->expectsOutputToContain('takussan_radar_accord_v2')
            ->expectsOutputToContain('Conditions : {{4}}')
            ->assertSuccessful();
        $this->artisan('radar:whatsapp-template', ['locale' => 'wo'])->assertFailed();
    }
}
