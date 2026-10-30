<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\Integration;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\Whatsapp\RadarWhatsappReceipts;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2427 (vérification adverse, I-1) — un accusé dont l'identifiant est inconnu n'est JAMAIS rattaché par inférence à
 * un envoi ambigu sans identifiant. Les deux scénarios qui ont fait retirer cette « adoption » :
 *
 * - B1 : la relance B est acceptée par Meta, son écriture est défaite (reprise m-3 de `RadarWhatsappOutreach`), et
 *   l'accusé de B arrive avant la reprise. Adopté par l'ancien ambigu A, il prenait `wamid.B` : la reprise heurtait
 *   l'index unique, B restait préparé, et un second clic rappelait Meta — un double envoi.
 * - B2 : un message étranger au Radar, sur le même `phone_number_id` (coexistence, envoi de test). Adopté, il faisait
 *   passer A, jamais parti, à `read`, et un « Oui » qui lui répondait se rattachait au message d'accord A.
 *
 * - B3 (TCK-2436) : B1 encore, mais l'accusé de B porte le jeton opaque posé à l'envoi de B. Le jeton de B n'est sur
 *   aucune ligne envoyée tant que la reprise ne l'a pas écrit : il n'apparie rien, et surtout pas A.
 *
 * Numéro fictif en `+221 77 123 45 67`, le fictif conventionnel du dépôt : un préfixe attribué, que `PhoneMasker`
 * reconnaît comme un numéro (il refuse `74`). Aucun réseau : `Http::fake()`.
 */
class RadarWhatsappReceiptGuardTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private const NUMERO_META = '221771234567';

    private User $operateur;

    private RadarAdvertiser $annonceur;

    private RadarListing $annonce;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-30 10:00:00');
        config([
            'app.frontend_url' => 'https://front.exemple.test',
            'whatsapp.base_uri' => 'https://graph.exemple.test/v21.0',
            'radar_whatsapp.driver' => 'cloud',
            'radar_whatsapp.phone_number_id' => 'RADAR-222',
            'radar_whatsapp.access_token' => 'jeton-radar',
            'radar_whatsapp.webhook_url_token' => 'jeton-url-radar',
            'radar_whatsapp.webhook_app_secret' => 'secret-application-radar',
        ]);
        Integration::factory()->create(['provider' => 'whatsapp_cloud', 'agency_id' => null,
            'credentials' => ['phone_number_id' => 'NOTIF-111', 'access_token' => 'jeton-notifications']]);
        $this->operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Fall']);
        $this->annonce = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id]);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function prepare(array $attributs = []): RadarOutreach
    {
        $composer = $this->app->make(ConsentMessageComposer::class);
        $message = RadarOutreach::factory()->withListings($this->annonce)->create($attributs + [
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => ConsentMessageComposer::CLAUSES_VERSION, 'locale' => 'fr',
            'salutation' => 'Bonjour Awa,', 'summary' => 'votre appartement à Ouakam', 'message' => '', 'created_by_id' => $this->operateur->id,
        ]);
        $message->forceFill(['message' => $composer->compose('fr', 'Bonjour Awa,', 'votre appartement à Ouakam', ConsentMessageComposer::CLAUSES_VERSION, $composer->claimUrlFor($message->load('advertiser')))])->save();

        return $message->refresh();
    }

    /** Un envoi par l'API, ambigu (délai, 5xx), sans identifiant : Meta l'a peut-être remis, peut-être pas. */
    private function ambiguSansIdentifiant(int $joursPlusTot): RadarOutreach
    {
        $message = $this->prepare();
        $message->forceFill(['sent_at' => now()->subDays($joursPlusTot), 'sent_by_id' => $this->operateur->id,
            'channel' => RadarOutreachChannel::WhatsappCloud, 'provider_status' => 'ambiguous'])->save();

        return $message->refresh();
    }

    private function corps(array $statuses = [], array $messages = []): array
    {
        return ['object' => 'whatsapp_business_account', 'entry' => [['id' => 'WABA', 'changes' => [['field' => 'messages', 'value' => array_filter([
            'messaging_product' => 'whatsapp', 'metadata' => ['display_phone_number' => '221770000000', 'phone_number_id' => 'RADAR-222'],
            'statuses' => $statuses, 'messages' => $messages,
        ])]]]]];
    }

    private function accuse(string $id, string $statut): array
    {
        return ['id' => $id, 'status' => $statut, 'timestamp' => (string) now()->getTimestamp(), 'recipient_id' => self::NUMERO_META];
    }

    private function recevoir(array $corps): void
    {
        $contenu = (string) json_encode($corps);
        $this->call('POST', '/api/webhooks/whatsapp/radar/jeton-url-radar', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $contenu, 'secret-application-radar'),
        ], $contenu)->assertOk();
    }

    public function test_b1_l_accuse_d_une_relance_dont_l_ecriture_est_defaite_ne_rouvre_pas_le_double_envoi(): void
    {
        $a = $this->ambiguSansIdentifiant(3);
        $b = $this->prepare(['follow_up_of_id' => $a->id, 'follow_up_rank' => 1]);
        Http::fake(['graph.exemple.test/*' => Http::response(['messages' => [['id' => 'wamid.B']]])]);

        // La première écriture de l'envoi échoue après l'acceptation de Meta : c'est la reprise m-3.
        $panne = true;
        RadarListing::saving(function () use (&$panne): void {
            if ($panne) {
                $panne = false;
                throw new RuntimeException('connexion perdue');
            }
        });
        // L'accusé `sent` de B arrive entre l'écriture défaite et la reprise (il attendait le verrou de l'annonceur).
        Event::listen(MessageLogged::class, function (MessageLogged $evenement): void {
            if (str_contains($evenement->message, 'écriture défaite')) {
                app(RadarWhatsappReceipts::class)->receive($this->corps([$this->accuse('wamid.B', 'sent')])['entry']);
            }
        });

        $this->postJson("/api/admin/radar/outreaches/{$b->id}/send")->assertOk();

        $b->refresh();
        $this->assertNotNull($b->sent_at);
        $this->assertSame('wamid.B', $b->provider_message_id);
        $this->assertSame('ambiguous', $b->provider_status);
        // A n'a rien pris : il reste ambigu, sans identifiant.
        $this->assertNull($a->fresh()->provider_message_id);
        $this->assertSame('ambiguous', $a->fresh()->provider_status);
        // Le second clic est refusé : Meta n'a été appelé qu'une fois.
        $this->postJson("/api/admin/radar/outreaches/{$b->id}/send")->assertStatus(409);
        Http::assertSentCount(1);
    }

    public function test_b2_l_accuse_d_un_message_etranger_au_radar_ne_fait_pas_d_un_envoi_ambigu_un_message_lu(): void
    {
        Bus::fake();
        $a = $this->ambiguSansIdentifiant(5);
        $autre = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id]);
        $b = RadarOutreach::factory()->withListings($autre)->create([
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => 'accord.v3', 'channel' => RadarOutreachChannel::WhatsappCloud,
            'sent_at' => now()->subDay(), 'provider_message_id' => 'wamid.B', 'provider_status' => 'delivered',
        ]);

        $this->recevoir($this->corps([$this->accuse('wamid.ETRANGER', 'read')]));

        $this->assertSame('ambiguous', $a->fresh()->provider_status);
        $this->assertNull($a->fresh()->provider_message_id);

        // Le « Oui » qui répond au message étranger ne se rattache pas au message d'accord A, jamais remis à coup sûr.
        $this->recevoir($this->corps(messages: [['from' => self::NUMERO_META, 'id' => 'wamid.REPONSE', 'timestamp' => (string) now()->getTimestamp(),
            'type' => 'text', 'text' => ['body' => 'Oui'], 'context' => ['from' => '221770000000', 'id' => 'wamid.ETRANGER']]]));

        $this->assertSame($b->id, RadarConsent::query()->sole()->radar_outreach_id);
    }

    public function test_b3_l_accuse_au_jeton_d_une_relance_dont_l_ecriture_est_defaite_n_apparie_ni_a_ni_b(): void
    {
        $a = $this->ambiguSansIdentifiant(3);
        $a->forceFill(['provider_callback_token' => str_repeat('a', 40)])->save();
        $b = $this->prepare(['follow_up_of_id' => $a->id, 'follow_up_rank' => 1]);
        Http::fake(['graph.exemple.test/*' => Http::response(['messages' => [['id' => 'wamid.B']]])]);

        $panne = true;
        RadarListing::saving(function () use (&$panne): void {
            if ($panne) {
                $panne = false;
                throw new RuntimeException('connexion perdue');
            }
        });
        // L'accusé de B, au jeton que l'envoi de B a transmis à Meta, arrive entre l'écriture défaite et la reprise.
        Event::listen(MessageLogged::class, function (MessageLogged $evenement): void {
            if (str_contains($evenement->message, 'écriture défaite')) {
                $jeton = Http::recorded()[0][0]['biz_opaque_callback_data'];
                app(RadarWhatsappReceipts::class)->receive($this->corps([['biz_opaque_callback_data' => $jeton] + $this->accuse('wamid.B-INCONNU', 'sent')])['entry']);
            }
        });

        $this->postJson("/api/admin/radar/outreaches/{$b->id}/send")->assertOk();

        $b->refresh();
        $this->assertSame('wamid.B', $b->provider_message_id);
        $this->assertSame('ambiguous', $b->provider_status);
        $this->assertSame(Http::recorded()[0][0]['biz_opaque_callback_data'], $b->provider_callback_token);
        $this->assertNull($a->fresh()->provider_message_id);
        $this->assertSame('ambiguous', $a->fresh()->provider_status);
        Http::assertSentCount(1);
    }
}
