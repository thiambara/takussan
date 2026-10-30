<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2444 — le code de Meta d'un message non remis, tenu par `radar_outreaches.provider_error_code` et rendu par la
 * fiche annonceur (`RadarOutreachResource`) : le code seul, `null` hors échec ; jamais le texte de l'erreur (`title`,
 * `message`, `error_data` peuvent citer le numéro). Aucun réseau : des corps de webhook écrits à la main.
 */
class RadarWhatsappDeliveryErrorCodeTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const NUMERO = '+221770123456';

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
        $this->message = RadarOutreach::factory()->withListings($this->annonce)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => 'accord.v3', 'channel' => RadarOutreachChannel::WhatsappCloud,
            'provider_message_id' => 'wamid.ENVOYE-1', 'provider_status' => 'accepted',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Un accusé tel que Meta le rapporte ; `code` : l'erreur, avec un texte qui cite le numéro. */
    private function accuse(string $statut, int|string|null $code = null): array
    {
        return ['id' => 'wamid.ENVOYE-1', 'status' => $statut, 'timestamp' => (string) now()->getTimestamp(), 'recipient_id' => '221770123456']
            + ($code === null ? [] : ['errors' => [['code' => $code, 'title' => 'Message undeliverable', 'message' => 'Re-engagement refused',
                'error_data' => ['details' => 'Le destinataire +221770123456 est injoignable.']]]]);
    }

    private function recevoir(array ...$accuses): void
    {
        $contenu = (string) json_encode(['object' => 'whatsapp_business_account', 'entry' => [['id' => 'WABA-RADAR', 'changes' => [[
            'field' => 'messages',
            'value' => [
                'messaging_product' => 'whatsapp',
                'metadata' => ['display_phone_number' => '221770000000', 'phone_number_id' => self::NUMERO_RADAR],
                'statuses' => $accuses,
            ],
        ]]]]]);

        $this->call('POST', '/api/webhooks/whatsapp/radar/'.self::JETON, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $contenu, self::SECRET),
        ], $contenu)->assertOk();
    }

    private function fiche(): TestResponse
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        return $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}")->assertOk();
    }

    /** @return array<string, mixed> */
    private function messageDeLaFiche(TestResponse $fiche): array
    {
        return collect($fiche->json('data.outreaches'))->firstWhere('id', $this->message->id);
    }

    public function test_ac1_un_failed_ecrit_le_code_de_meta_et_la_fiche_le_rend_avec_le_statut(): void
    {
        $this->recevoir($this->accuse('failed', 131026));

        $this->assertSame(131026, $this->message->fresh()->provider_error_code);
        $rendu = $this->messageDeLaFiche($this->fiche());
        $this->assertSame('failed', $rendu['provider_status']);
        $this->assertSame(131026, $rendu['provider_error_code']);
        // Le journal d'activité garde son code, comme avant TCK-2444.
        $this->assertSame(131026, Activity::query()->where('event', 'radar_whatsapp_delivery_failed')->sole()->properties['provider_error_code']);
    }

    public function test_un_code_ecrit_en_chiffres_dans_une_chaine_est_lu_comme_un_entier(): void
    {
        $this->recevoir($this->accuse('failed', '131049'));

        $this->assertSame(131049, $this->messageDeLaFiche($this->fiche())['provider_error_code']);
    }

    public function test_ac2_un_failed_sans_code_rend_null(): void
    {
        $this->recevoir($this->accuse('failed'));

        $this->assertNull($this->message->fresh()->provider_error_code);
        $rendu = $this->messageDeLaFiche($this->fiche());
        $this->assertSame('failed', $rendu['provider_status']);
        $this->assertArrayHasKey('provider_error_code', $rendu);
        $this->assertNull($rendu['provider_error_code']);
    }

    public function test_ac3_aucune_reponse_ne_rend_le_texte_de_l_erreur_de_meta(): void
    {
        $this->recevoir($this->accuse('failed', 131026));

        // Le numéro de l'annonceur est rendu par la fiche elle-même (`phone`) : on cherche ici le texte de l'erreur.
        $vue = $this->fiche()->getContent();
        $this->assertStringContainsString('131026', $vue);
        foreach (['undeliverable', 'Re-engagement', 'injoignable', 'error_data', 'details'] as $interdit) {
            $this->assertStringNotContainsStringIgnoringCase($interdit, $vue);
        }
    }

    /** Un accusé qui n'est pas `failed` ne pose jamais de code, même s'il porte une erreur. */
    public function test_un_accuse_qui_n_est_pas_un_echec_ne_pose_aucun_code(): void
    {
        $this->recevoir($this->accuse('delivered', 131026));

        $this->assertSame('delivered', $this->message->fresh()->provider_status);
        $this->assertNull($this->message->fresh()->provider_error_code);
        $this->assertNull($this->messageDeLaFiche($this->fiche())['provider_error_code']);
    }

    /** `RadarWhatsappReceipts::advances()` : rien ne remplace `failed` ; le code reste donc celui de l'échec. */
    public function test_rien_ne_fait_quitter_failed_et_le_code_reste(): void
    {
        $this->recevoir($this->accuse('failed', 131026));
        $this->recevoir($this->accuse('delivered'), $this->accuse('read'), $this->accuse('failed', 131049));

        $this->assertSame('failed', $this->message->fresh()->provider_status);
        $this->assertSame(131026, $this->message->fresh()->provider_error_code);
    }

    /** Un statut qui avance hors échec remet le code à null : il n'en reste jamais un à côté d'une remise. */
    public function test_un_statut_qui_avance_hors_echec_remet_le_code_a_null(): void
    {
        $this->message->forceFill(['provider_status' => 'sent', 'provider_error_code' => 131026])->save();

        $this->recevoir($this->accuse('delivered'));

        $this->assertSame('delivered', $this->message->fresh()->provider_status);
        $this->assertNull($this->message->fresh()->provider_error_code);
    }

    /** La ressource ne rend un code qu'avec le statut `failed`, quoi que porte la colonne. */
    public function test_la_fiche_ne_rend_aucun_code_hors_echec(): void
    {
        $this->message->forceFill(['provider_status' => 'delivered', 'provider_error_code' => 131026])->save();

        $rendu = $this->messageDeLaFiche($this->fiche());
        $this->assertSame('delivered', $rendu['provider_status']);
        $this->assertNull($rendu['provider_error_code']);
    }
}
