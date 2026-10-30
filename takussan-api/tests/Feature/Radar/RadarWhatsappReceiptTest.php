<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\IntegrationWebhookLog;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2427 (ADR-0081, AC1) — les accusés de livraison du numéro WhatsApp du Radar (`statuses` : `sent`, `delivered`,
 * `read`, `failed`), lus sur son webhook. `provider_status` les suit sans jamais reculer, dans quelque ordre et autant de
 * fois que Meta les livre ; un `failed` est journalisé avec son code Meta ; un accusé n'est jamais une preuve d'accord.
 * Aucun réseau : des corps de webhook écrits à la main.
 */
class RadarWhatsappReceiptTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private const NUMERO_RADAR = 'RADAR-222';

    private const JETON = 'jeton-url-radar';

    private const SECRET = 'secret-application-radar';

    private RadarAdvertiser $annonceur;

    private RadarListing $annonce;

    private RadarOutreach $message;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-30 10:00:00');
        config([
            'radar_whatsapp.phone_number_id' => self::NUMERO_RADAR,
            'radar_whatsapp.webhook_url_token' => self::JETON,
            'radar_whatsapp.webhook_app_secret' => self::SECRET,
        ]);

        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Fall']);
        $this->annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Contacted]);
        $this->message = $this->envoye('wamid.ENVOYE-1', 'accepted');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function envoye(?string $wamid, string $statut, array $attributs = []): RadarOutreach
    {
        return RadarOutreach::factory()->withListings($this->annonce)->sent()->create($attributs + [
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => 'accord.v3', 'channel' => RadarOutreachChannel::WhatsappCloud,
            'provider_message_id' => $wamid, 'provider_status' => $statut,
        ]);
    }

    /** Un accusé tel que Meta le rapporte ; `code` : l'erreur d'un `failed`. */
    private function accuse(string $statut, string $id = 'wamid.ENVOYE-1', ?int $code = null, ?int $horodatage = null, string $vers = '221771234567'): array
    {
        return ['id' => $id, 'status' => $statut, 'timestamp' => (string) ($horodatage ?? now()->getTimestamp()), 'recipient_id' => $vers]
            + ($code === null ? [] : ['errors' => [['code' => $code, 'title' => 'Message undeliverable', 'message' => 'Message undeliverable',
                'error_data' => ['details' => 'Le destinataire +221771234567 est injoignable.']]]]);
    }

    /** @param  list<array<string, mixed>>  $accuses */
    private function corps(array $accuses, string $numero = self::NUMERO_RADAR, array $messages = []): array
    {
        return ['object' => 'whatsapp_business_account', 'entry' => [['id' => 'WABA-RADAR', 'changes' => [[
            'field' => 'messages',
            'value' => array_filter([
                'messaging_product' => 'whatsapp',
                'metadata' => ['display_phone_number' => '221770000000', 'phone_number_id' => $numero],
                'statuses' => $accuses,
                'messages' => $messages,
            ]),
        ]]]]];
    }

    private function recevoir(array $corps): TestResponse
    {
        $contenu = (string) json_encode($corps);

        return $this->call('POST', '/api/webhooks/whatsapp/radar/'.self::JETON, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $contenu, self::SECRET),
        ], $contenu);
    }

    // --- AC1 : l'échec ------------------------------------------------------------------------------

    public function test_ac1_un_accuse_failed_passe_le_message_a_failed_journalise_avec_le_code_meta(): void
    {
        $this->recevoir($this->corps([$this->accuse('failed', code: 131026)]))->assertOk()->assertJson(['ok' => true]);

        $this->assertSame('failed', $this->message->fresh()->provider_status);
        $journal = Activity::query()->where('event', 'radar_whatsapp_delivery_failed')->sole();
        $this->assertSame($this->message->id, $journal->subject_id);
        $this->assertEqualsCanonicalizing([
            'outreach_id' => $this->message->id,
            'provider_message_id' => 'wamid.ENVOYE-1',
            'channel' => 'whatsapp_cloud',
            'previous_status' => 'accepted',
            'provider_error_code' => 131026,
        ], $journal->properties->all());
        $this->assertSame(1, IntegrationWebhookLog::query()->sole()->matched_count);
        $this->assertSame('statuses', IntegrationWebhookLog::query()->sole()->event_type);
    }

    /** Ni le texte de l'erreur de Meta, ni le numéro : ni au journal d'activité, ni au journal des webhooks. */
    public function test_ac1_aucun_texte_ni_numero_ne_reste_dans_les_journaux(): void
    {
        $this->recevoir($this->corps([$this->accuse('failed', code: 131026)]))->assertOk();

        $ligne = IntegrationWebhookLog::query()->sole();
        $this->assertNull($ligne->getAttributes()['body']);
        $vue = (string) json_encode($ligne->payload);
        $this->assertStringContainsString('131026', $vue);
        foreach (['771234567', 'injoignable', 'undeliverable'] as $interdit) {
            $this->assertStringNotContainsStringIgnoringCase($interdit, $vue);
            $this->assertStringNotContainsStringIgnoringCase($interdit, (string) json_encode(Activity::query()->get()->toArray()));
        }
    }

    public function test_un_failed_sur_un_envoi_ambigu_qui_porte_son_identifiant_dit_qu_il_n_est_pas_parti(): void
    {
        $this->message->forceFill(['provider_status' => 'ambiguous'])->save();

        $this->recevoir($this->corps([$this->accuse('failed', code: 131049)]))->assertOk();

        $this->assertSame('failed', $this->message->fresh()->provider_status);
        $this->assertSame('ambiguous', Activity::query()->where('event', 'radar_whatsapp_delivery_failed')->sole()->properties['previous_status']);
    }

    // --- Un envoi ambigu sans identifiant -----------------------------------------------------------

    /**
     * Un envoi ambigu (délai, 5xx) n'a pas d'identifiant : un accusé d'un identifiant inconnu, au numéro de l'annonceur, ne
     * peut venir que de lui — le seul envoi ambigu sans identifiant de cet annonceur prend l'identifiant et le statut.
     */
    public function test_un_accuse_inconnu_au_numero_de_l_annonceur_se_rattache_a_son_seul_envoi_ambigu_sans_identifiant(): void
    {
        $this->message->forceFill(['provider_status' => 'delivered'])->save();
        $ambigu = $this->envoye(null, 'ambiguous');

        $this->recevoir($this->corps([$this->accuse('failed', 'wamid.AMBIGU-1', 131026)]))->assertOk();

        $ambigu->refresh();
        $this->assertSame('failed', $ambigu->provider_status);
        $this->assertSame('wamid.AMBIGU-1', $ambigu->provider_message_id);
        $this->assertSame('delivered', $this->message->fresh()->provider_status);
        $journal = Activity::query()->where('event', 'radar_whatsapp_delivery_failed')->sole();
        $this->assertSame($ambigu->id, $journal->properties['outreach_id']);
        $this->assertTrue($journal->properties['adopted']);

        // L'identifiant adopté : l'accusé suivant s'apparie par lui, sans plus deviner.
        $this->recevoir($this->corps([$this->accuse('failed', 'wamid.AMBIGU-1', 131026)]))->assertOk();
        $this->assertSame(1, Activity::query()->where('event', 'radar_whatsapp_delivery_failed')->count());
    }

    public function test_un_delivered_inconnu_dit_qu_un_envoi_ambigu_est_parti(): void
    {
        $ambigu = $this->envoye(null, 'ambiguous');

        $this->recevoir($this->corps([$this->accuse('delivered', 'wamid.AMBIGU-1')]))->assertOk();

        $this->assertSame('delivered', $ambigu->fresh()->provider_status);
        $this->assertSame('wamid.AMBIGU-1', $ambigu->fresh()->provider_message_id);
    }

    public function test_deux_envois_ambigus_sans_identifiant_ne_se_devinent_pas(): void
    {
        $premier = $this->envoye(null, 'ambiguous');
        $second = $this->envoye(null, 'ambiguous');

        $this->recevoir($this->corps([$this->accuse('failed', 'wamid.AMBIGU-1', 131026)]))->assertOk();

        $this->assertSame(['ambiguous', 'ambiguous'], [$premier->fresh()->provider_status, $second->fresh()->provider_status]);
        $this->assertNull($premier->fresh()->provider_message_id);
        $this->assertSame(0, IntegrationWebhookLog::query()->sole()->matched_count);
    }

    public function test_un_accuse_bien_anterieur_a_l_envoi_ambigu_ne_s_y_rattache_pas(): void
    {
        $ambigu = $this->envoye(null, 'ambiguous');

        $this->recevoir($this->corps([$this->accuse('failed', 'wamid.AMBIGU-1', 131026, now()->subMinutes(11)->getTimestamp())]))->assertOk();

        $this->assertSame('ambiguous', $ambigu->fresh()->provider_status);
        $this->assertNull($ambigu->fresh()->provider_message_id);
    }

    public function test_un_accuse_inconnu_d_un_numero_inconnu_ne_touche_rien(): void
    {
        $ambigu = $this->envoye(null, 'ambiguous');

        $this->recevoir($this->corps([$this->accuse('failed', 'wamid.AUTRE-1', 131026, vers: '221779999999')]))->assertOk();

        $this->assertSame('ambiguous', $ambigu->fresh()->provider_status);
        $this->assertSame('accepted', $this->message->fresh()->provider_status);
        $this->assertSame(0, Activity::query()->count());
    }

    // --- Ordre et doublons ------------------------------------------------------------------------

    public function test_le_statut_avance_sent_delivered_read_et_ne_recule_jamais_dans_le_desordre_ou_en_double(): void
    {
        $this->recevoir($this->corps([$this->accuse('sent')]))->assertOk();
        $this->assertSame('sent', $this->message->fresh()->provider_status);

        // `read` livré avant `delivered`, puis `delivered` et `sent` en retard, puis `read` en double.
        $this->recevoir($this->corps([$this->accuse('read')]))->assertOk();
        $this->recevoir($this->corps([$this->accuse('delivered'), $this->accuse('sent')]))->assertOk();
        $this->recevoir($this->corps([$this->accuse('read')]))->assertOk();

        $this->assertSame('read', $this->message->fresh()->provider_status);
        $this->assertSame([1, 1, 0, 0], IntegrationWebhookLog::query()->orderBy('id')->pluck('matched_count')->all());
        $this->assertSame(0, Activity::query()->count());
    }

    /** Un message remis n'échoue plus : un `failed` qui suit `delivered` ou `read` est ignoré ; rien ne suit un `failed`. */
    public function test_failed_ne_suit_pas_une_remise_et_rien_ne_suit_failed(): void
    {
        $this->message->forceFill(['provider_status' => 'delivered'])->save();
        $this->recevoir($this->corps([$this->accuse('failed', code: 131026)]))->assertOk();
        $this->assertSame('delivered', $this->message->fresh()->provider_status);

        $this->message->forceFill(['provider_status' => 'sent'])->save();
        $this->recevoir($this->corps([$this->accuse('failed', code: 131026)]))->assertOk();
        $this->recevoir($this->corps([$this->accuse('delivered'), $this->accuse('read'), $this->accuse('failed', code: 131026)]))->assertOk();

        $this->assertSame('failed', $this->message->fresh()->provider_status);
        $this->assertSame(1, Activity::query()->where('event', 'radar_whatsapp_delivery_failed')->count());
    }

    public function test_un_statut_que_le_radar_ne_connait_pas_est_ignore(): void
    {
        $this->recevoir($this->corps([$this->accuse('deleted'), $this->accuse('warning'), $this->accuse('')]))->assertOk();

        $this->assertSame('accepted', $this->message->fresh()->provider_status);
    }

    // --- Ce qu'un accusé n'est jamais --------------------------------------------------------------

    public function test_un_accuse_n_est_jamais_une_preuve_d_accord_ni_ne_change_l_envoi(): void
    {
        $envoyeLe = $this->message->sent_at;

        $this->recevoir($this->corps([$this->accuse('delivered'), $this->accuse('read')]))->assertOk();

        $message = $this->message->fresh();
        $this->assertSame('read', $message->provider_status);
        $this->assertEquals($envoyeLe, $message->sent_at);
        $this->assertNull($message->outcome);
        $this->assertSame(0, RadarConsent::query()->count());
        $this->assertSame(RadarListingStage::Contacted, $this->annonce->fresh()->stage);
    }

    public function test_un_accuse_adresse_a_un_autre_numero_est_ignore(): void
    {
        $this->recevoir($this->corps([$this->accuse('failed', code: 131026)], numero: 'NOTIFICATIONS-111'))->assertOk();

        $this->assertSame('accepted', $this->message->fresh()->provider_status);
    }

    /** Un message manuel (`wa.me`) part d'un autre téléphone : aucun accusé du numéro du Radar ne le vise. */
    public function test_un_message_manuel_n_est_jamais_vise(): void
    {
        $manuel = $this->envoye(null, 'ambiguous', ['channel' => RadarOutreachChannel::WhatsappManual]);
        $this->message->forceFill(['provider_status' => 'read'])->save();

        $this->recevoir($this->corps([$this->accuse('failed', 'wamid.INCONNU-1', 131026)]))->assertOk();

        $this->assertNull($manuel->fresh()->provider_message_id);
        $this->assertSame('ambiguous', $manuel->fresh()->provider_status);
    }

    public function test_messages_et_accuses_d_une_meme_requete_sont_lus_tous_les_deux(): void
    {
        Bus::fake([PurgeRadarAdvertiser::class]);
        config(['radar_whatsapp.auto_stop' => true]);
        $stop = ['from' => '221771234567', 'id' => 'wamid.STOP-1', 'timestamp' => (string) now()->getTimestamp(), 'type' => 'text', 'text' => ['body' => 'STOP'],
            'context' => ['from' => '221770000000', 'id' => 'wamid.ENVOYE-1']];

        $this->recevoir($this->corps([$this->accuse('read')], messages: [$stop]))->assertOk();

        $this->assertSame('read', $this->message->fresh()->provider_status);
        $this->assertNotNull($this->annonceur->fresh()->do_not_contact_at);
        $this->assertSame('messages', IntegrationWebhookLog::query()->sole()->event_type);
        $this->assertSame(2, IntegrationWebhookLog::query()->sole()->matched_count);
    }
}
