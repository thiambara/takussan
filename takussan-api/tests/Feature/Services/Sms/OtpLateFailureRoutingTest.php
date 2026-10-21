<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-1093 (P72.03) — un code à usage unique dont l'accusé revient `failed` fait sauter son
 * fournisseur au renvoi, pour ce numéro et pendant 15 minutes. Avant, la chaîne se relisait telle
 * quelle dans `sms.fallback_chains` : le renvoi repartait par le fournisseur qui venait d'échouer.
 */
class OtpLateFailureRoutingTest extends TestCase
{
    use RefreshDatabase;

    private const ORANGE = '+221771234567';

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        config()->set('sms.quiet_hours.enabled', false);
        foreach (['sms_orange', 'sms_lafricamobile', 'sms_mtarget'] as $provider) {
            Integration::create([
                'provider' => $provider,
                'agency_id' => $this->agency->id,
                'credentials' => [
                    'client_id' => 'cid', 'client_secret' => 'csec', 'sender_address' => 'tel:+221771111111',
                    'username' => 'mtg-user', 'password' => 'pass', 'accountid' => 'lam-acc', 'sender_id' => 'TAKUSSAN',
                ],
                'metadata' => [],
                'is_active' => true,
            ]);
        }
        Http::preventStrayRequests();
        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 'tok', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => Http::sequence()
                ->push(['outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/1']], 201)
                ->push(['outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/2']], 201)
                ->push(['outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/3']], 201),
            'lampush*' => Http::sequence()
                ->push(['push_id' => 'lam-1'], 200)
                ->push(['push_id' => 'lam-2'], 200),
            'api-public-2.mtarget.fr/*' => Http::response(['results' => [['code' => 0, 'ticket' => 'mtg-1']]], 200),
        ]);
    }

    private function send(bool $otp): SmsResult
    {
        return app(SmsRouterDriver::class)->send(self::ORANGE, 'code 123456', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
            'is_otp' => $otp,
        ])[self::ORANGE];
    }

    private function accuseFailed(SmsResult $envoi): void
    {
        $this->assertNotNull($envoi->providerMessageId);
        app(DeliveryAttemptUpdater::class)->applyStatus($envoi->provider, $envoi->providerMessageId, 'failed',
            failureReason: 'UNDELIV', statusPrecedence: DeliveryAttemptUpdater::SMS_STATUS_PRECEDENCE);
    }

    public function test_le_renvoi_d_un_code_saute_le_fournisseur_dont_l_accuse_est_revenu_failed(): void
    {
        $premier = $this->send(otp: true);
        $this->assertSame('orange', $premier->provider);
        $this->accuseFailed($premier);

        $renvoi = $this->send(otp: true);

        $this->assertSame(SmsResult::STATUS_SENT, $renvoi->status);
        $this->assertSame('lafricamobile', $renvoi->provider);
        $this->assertSame(1, NotificationDeliveryAttempt::query()->where('provider', 'orange')->count());
    }

    public function test_un_sms_qui_n_est_pas_un_code_garde_la_chaine(): void
    {
        $premier = $this->send(otp: false);
        $this->accuseFailed($premier);

        $this->assertSame('orange', $this->send(otp: true)->provider);
    }

    public function test_au_dela_de_quinze_minutes_le_fournisseur_revient(): void
    {
        $premier = $this->send(otp: true);
        $this->accuseFailed($premier);

        $this->travel(16)->minutes();

        $this->assertSame('orange', $this->send(otp: true)->provider);
    }

    public function test_quand_toute_la_chaine_a_echoue_elle_est_rejouee_entiere(): void
    {
        $this->accuseFailed($this->send(otp: true));
        $this->accuseFailed($this->send(otp: true));
        $troisieme = $this->send(otp: true);
        $this->assertSame('mtarget', $troisieme->provider);
        $this->accuseFailed($troisieme);

        $this->assertSame('orange', $this->send(otp: true)->provider);
    }
}
