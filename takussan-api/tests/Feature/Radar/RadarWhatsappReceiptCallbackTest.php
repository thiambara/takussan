<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2436 (ADR-0081, amendement du 2026-10-30) — l'appariement EXACT d'un envoi ambigu sans identifiant (délai, 5xx) par
 * le jeton opaque posé à l'envoi (`biz_opaque_callback_data`), que Meta rend dans ses accusés. Un accusé rattaché ainsi
 * écrit l'identifiant de Meta sur la ligne et fait avancer son statut.
 *
 * Rien n'est rattaché par inférence (décision B3) : un accusé sans jeton, au jeton inconnu, au jeton d'un envoi qui n'est
 * pas ambigu sans identifiant, ou dont le destinataire n'est pas l'annonceur de cet envoi, n'est rattaché à rien —
 * rejouer ou forger un jeton ne rattache rien.
 *
 * Numéro fictif en `+221 77 123 45 67`, comme `RadarWhatsappReceiptTest`. Aucun réseau : des corps de webhook écrits à la
 * main.
 */
class RadarWhatsappReceiptCallbackTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private const NUMERO_META = '221771234567';

    private const NUMERO_RADAR = 'RADAR-222';

    private const JETON_URL = 'jeton-url-radar';

    private const SECRET = 'secret-application-radar';

    private const JETON = '0123456789abcdef0123456789abcdef01234567';

    private RadarAdvertiser $annonceur;

    private RadarListing $annonce;

    private RadarOutreach $ambigu;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-30 10:00:00');
        config([
            'radar_whatsapp.phone_number_id' => self::NUMERO_RADAR,
            'radar_whatsapp.webhook_url_token' => self::JETON_URL,
            'radar_whatsapp.webhook_app_secret' => self::SECRET,
        ]);

        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Fall']);
        $this->annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Contacted]);
        $this->ambigu = $this->envoye($this->annonceur, $this->annonce, null, 'ambiguous', self::JETON);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function envoye(RadarAdvertiser $annonceur, RadarListing $annonce, ?string $wamid, ?string $statut, ?string $jeton): RadarOutreach
    {
        $message = RadarOutreach::factory()->withListings($annonce)->sent()->create([
            'radar_advertiser_id' => $annonceur->id, 'clauses_version' => 'accord.v3', 'channel' => RadarOutreachChannel::WhatsappCloud,
            'provider_message_id' => $wamid, 'provider_status' => $statut,
        ]);
        $message->forceFill(['provider_callback_token' => $jeton])->save();

        return $message->refresh();
    }

    /** Un accusé tel que Meta le rapporte ; `jeton` : la valeur opaque posée à l'envoi, que Meta rend telle quelle. */
    private function accuse(string $statut, string $id, ?string $jeton = self::JETON, string $destinataire = self::NUMERO_META): array
    {
        return ['id' => $id, 'status' => $statut, 'timestamp' => (string) now()->getTimestamp(), 'recipient_id' => $destinataire]
            + ($jeton === null ? [] : ['biz_opaque_callback_data' => $jeton])
            + ($statut === 'failed' ? ['errors' => [['code' => 131026, 'title' => 'Message undeliverable']]] : []);
    }

    /** @param  list<array<string, mixed>>  $accuses */
    private function recevoir(array $accuses): TestResponse
    {
        $contenu = (string) json_encode(['object' => 'whatsapp_business_account', 'entry' => [['id' => 'WABA-RADAR', 'changes' => [[
            'field' => 'messages',
            'value' => [
                'messaging_product' => 'whatsapp',
                'metadata' => ['display_phone_number' => '221770000000', 'phone_number_id' => self::NUMERO_RADAR],
                'statuses' => $accuses,
            ],
        ]]]]]);

        return $this->call('POST', '/api/webhooks/whatsapp/radar/'.self::JETON_URL, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $contenu, self::SECRET),
        ], $contenu);
    }

    private function assertToujoursAmbigu(?RadarOutreach $message = null): void
    {
        $frais = ($message ?? $this->ambigu)->fresh();
        $this->assertSame('ambiguous', $frais->provider_status);
        $this->assertNull($frais->provider_message_id);
    }

    // --- AC1 : l'appariement exact -------------------------------------------------------------------

    /** AC1 — `sent`, `delivered`, `read` : les statuts où la documentation de Meta garantit le renvoi du jeton. */
    public function test_ac1_un_accuse_remis_au_jeton_d_un_envoi_ambigu_le_rattache_exactement(): void
    {
        $this->recevoir([$this->accuse('delivered', 'wamid.TARDIF')])->assertOk();

        $frais = $this->ambigu->fresh();
        $this->assertSame('wamid.TARDIF', $frais->provider_message_id);
        $this->assertSame('delivered', $frais->provider_status);
        $this->assertNotNull($frais->sent_at);

        // L'identifiant écrit, la suite des accusés s'apparie par lui, sans jeton.
        $this->recevoir([$this->accuse('read', 'wamid.TARDIF', jeton: null)])->assertOk();
        $this->assertSame('read', $this->ambigu->fresh()->provider_status);
    }

    public function test_ac1_un_accuse_sent_ou_read_au_jeton_d_un_envoi_ambigu_le_rattache_aussi(): void
    {
        $autre = $this->envoye($this->annonceur, $this->annonce, null, 'ambiguous', str_repeat('b', 40));

        $this->recevoir([$this->accuse('sent', 'wamid.S'), $this->accuse('read', 'wamid.R', str_repeat('b', 40))])->assertOk();

        $this->assertSame(['wamid.S', 'sent'], [$this->ambigu->fresh()->provider_message_id, $this->ambigu->fresh()->provider_status]);
        $this->assertSame(['wamid.R', 'read'], [$autre->fresh()->provider_message_id, $autre->fresh()->provider_status]);
    }

    /** AC1 — deux envois ambigus du même annonceur : le jeton désigne le sien, et lui seul — jamais « l'autre ambigu ». */
    public function test_ac1_le_jeton_designe_son_envoi_et_lui_seul(): void
    {
        $recent = $this->envoye($this->annonceur, $this->annonce, null, 'ambiguous', str_repeat('9', 40));

        $this->recevoir([$this->accuse('delivered', 'wamid.RECENT', str_repeat('9', 40))])->assertOk();

        $this->assertSame('wamid.RECENT', $recent->fresh()->provider_message_id);
        $this->assertToujoursAmbigu();
    }

    /** AC1 — un `failed` qui porte le jeton (non garanti par la documentation, à mesurer) dit que l'envoi n'est pas parti. */
    public function test_ac1_un_accuse_failed_au_jeton_d_un_envoi_ambigu_le_passe_a_failed(): void
    {
        $this->recevoir([$this->accuse('failed', 'wamid.ECHEC')])->assertOk();

        $frais = $this->ambigu->fresh();
        $this->assertSame('failed', $frais->provider_status);
        $this->assertSame('wamid.ECHEC', $frais->provider_message_id);
        $journal = Activity::query()->where('event', 'radar_whatsapp_delivery_failed')->sole();
        $this->assertSame($this->ambigu->id, $journal->subject_id);
        $this->assertSame('ambiguous', $journal->properties['previous_status']);
        $this->assertSame('wamid.ECHEC', $journal->properties['provider_message_id']);
        $this->assertArrayNotHasKey('provider_callback_token', $journal->properties->all());
    }

    // --- AC2 : rien par inférence --------------------------------------------------------------------

    /** AC2 — sans jeton, un `failed` d'identifiant inconnu reste ignoré, comme avant TCK-2436 : aucune perte, aucun gain. */
    public function test_ac2_un_accuse_sans_jeton_n_est_rattache_a_rien(): void
    {
        $this->recevoir([$this->accuse('failed', 'wamid.INCONNU', jeton: null), $this->accuse('read', 'wamid.AUTRE', jeton: null)])->assertOk();

        $this->assertToujoursAmbigu();
        $this->assertSame(0, Activity::query()->where('event', 'radar_whatsapp_delivery_failed')->count());
    }

    public function test_ac2_un_jeton_inconnu_vide_ou_trop_long_n_est_rattache_a_rien(): void
    {
        $this->recevoir([
            $this->accuse('read', 'wamid.X1', 'ffffffffffffffffffffffffffffffffffffffff'),
            $this->accuse('read', 'wamid.X2', ''),
            $this->accuse('read', 'wamid.X3', self::JETON.str_repeat('0', 600)),
        ])->assertOk();

        $this->assertToujoursAmbigu();
    }

    /** AC2 — le jeton d'un envoi, porté par un accusé adressé à un autre numéro : forgé, ou d'un message étranger. */
    public function test_ac2_le_jeton_d_un_envoi_adresse_a_un_autre_destinataire_n_est_rattache_a_rien(): void
    {
        $this->recevoir([$this->accuse('delivered', 'wamid.FORGE', destinataire: '221779999999')])->assertOk();

        $this->assertToujoursAmbigu();
    }

    /** AC2 — un annonceur purgé n'a plus de numéro : aucun destinataire ne lui correspond. */
    public function test_ac2_le_jeton_de_l_envoi_d_un_annonceur_sans_numero_n_est_rattache_a_rien(): void
    {
        $this->annonceur->forceFill(['phone' => null])->save();

        $this->recevoir([$this->accuse('delivered', 'wamid.PURGE')])->assertOk();

        $this->assertToujoursAmbigu();
    }

    /** AC2 — le jeton d'un autre annonceur, présenté pour le numéro de celui-ci, ne traverse pas la frontière. */
    public function test_ac2_le_jeton_d_un_autre_annonceur_n_est_rattache_a_rien(): void
    {
        $autre = RadarAdvertiser::factory()->create(['phone' => '+221778888888', 'display_name' => 'Moussa Diop']);
        $annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $autre->id, 'stage' => RadarListingStage::Contacted]);
        $sien = $this->envoye($autre, $annonce, null, 'ambiguous', str_repeat('c', 40));

        $this->recevoir([$this->accuse('delivered', 'wamid.CROISE', str_repeat('c', 40))])->assertOk();

        $this->assertToujoursAmbigu($sien);
        $this->assertToujoursAmbigu();
    }

    /** AC2 — un envoi qui a déjà son identifiant (la reprise d'une écriture défaite l'a gardé, ambigu) ne prend pas celui d'un autre accusé, même au bon jeton. */
    public function test_ac2_le_jeton_d_un_envoi_deja_identifie_ne_lui_donne_pas_un_second_identifiant(): void
    {
        $identifie = $this->envoye($this->annonceur, $this->annonce, 'wamid.CONNU', 'ambiguous', str_repeat('d', 40));

        $this->recevoir([$this->accuse('read', 'wamid.AUTRE', str_repeat('d', 40))])->assertOk();

        $this->assertSame(['wamid.CONNU', 'ambiguous'], [$identifie->fresh()->provider_message_id, $identifie->fresh()->provider_status]);
    }

    /** AC2 — le jeton d'un message manuel (`wa.me`), ou d'un message préparé jamais parti, n'apparie rien. */
    public function test_ac2_le_jeton_d_un_message_manuel_ou_non_envoye_n_est_rattache_a_rien(): void
    {
        $manuel = $this->envoye($this->annonceur, $this->annonce, null, 'ambiguous', str_repeat('e', 40));
        $manuel->forceFill(['channel' => RadarOutreachChannel::WhatsappManual])->save();
        $prepare = $this->envoye($this->annonceur, $this->annonce, null, 'ambiguous', str_repeat('f', 40));
        $prepare->forceFill(['sent_at' => null])->save();

        $this->recevoir([$this->accuse('read', 'wamid.M', str_repeat('e', 40)), $this->accuse('read', 'wamid.P', str_repeat('f', 40))])->assertOk();

        $this->assertNull($manuel->fresh()->provider_message_id);
        $this->assertNull($prepare->fresh()->provider_message_id);
    }

    /** AC2 — rejouer le jeton d'un envoi déjà apparié, sous un autre identifiant, ne le réécrit pas. */
    public function test_ac2_rejouer_un_jeton_deja_apparie_sous_un_autre_identifiant_ne_rattache_rien(): void
    {
        $this->recevoir([$this->accuse('sent', 'wamid.PREMIER')])->assertOk();
        $this->recevoir([$this->accuse('read', 'wamid.REJOUE')])->assertOk();

        $frais = $this->ambigu->fresh();
        $this->assertSame('wamid.PREMIER', $frais->provider_message_id);
        $this->assertSame('sent', $frais->provider_status);
    }

    /** AC2 — un identifiant déjà connu s'apparie par lui : le jeton ne détourne pas son accusé vers l'envoi ambigu. */
    public function test_ac2_un_identifiant_connu_s_apparie_par_lui_jamais_par_le_jeton(): void
    {
        $pris = $this->envoye($this->annonceur, $this->annonce, 'wamid.PRIS', 'accepted', str_repeat('a', 40));

        $this->recevoir([$this->accuse('delivered', 'wamid.PRIS')])->assertOk();

        $this->assertSame('delivered', $pris->fresh()->provider_status);
        $this->assertToujoursAmbigu();
    }

    /** AC2 — l'identifiant de l'accusé est déjà porté par une autre ligne, hors du canal de l'API : il ne s'écrit pas deux fois. */
    public function test_ac2_un_identifiant_deja_porte_par_une_autre_ligne_ne_s_ecrit_pas_une_seconde_fois(): void
    {
        $manuel = $this->envoye($this->annonceur, $this->annonce, 'wamid.DOUBLE', null, null);
        $manuel->forceFill(['channel' => RadarOutreachChannel::WhatsappManual])->save();

        $this->recevoir([$this->accuse('delivered', 'wamid.DOUBLE')])->assertOk();

        $this->assertToujoursAmbigu();
        $this->assertNull($manuel->fresh()->provider_status);
    }
}
