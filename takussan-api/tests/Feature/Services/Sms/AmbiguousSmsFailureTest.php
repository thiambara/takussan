<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\User;
use App\Notifications\Channels\SmsChannel;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Account\DeletionStepUpService;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-766 (P27.02) — un échec ambigu (délai dépassé, réponse 5xx) ne passe pas
 * au fournisseur suivant : le premier a pu accepter le SMS, et le suivant le
 * renverrait. Un échec sûr (connexion refusée, 4xx) se replie toujours, et un
 * code à usage unique (`is_otp`) garde le repli dans tous les cas.
 */
class AmbiguousSmsFailureTest extends TestCase
{
    use RefreshDatabase;

    private const ORANGE = '+221771234567';

    private const FREE = '+221761234567';

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        config()->set('sms.webhook_url_token', 'tck-766-test-token');
        config()->set('sms.quiet_hours.enabled', false);
        foreach (['sms_orange', 'sms_lafricamobile', 'sms_mtarget'] as $provider) {
            Integration::create([
                'provider' => $provider,
                'agency_id' => $this->agency->id,
                'credentials' => [
                    'client_id' => 'cid',
                    'client_secret' => 'csec',
                    'sender_address' => 'tel:+221771111111',
                    'username' => 'mtg-user',
                    'password' => 'pass',
                    'accountid' => 'lam-acc',
                    'sender_id' => 'TAKUSSAN',
                ],
                'metadata' => [],
                'is_active' => true,
            ]);
        }
    }

    private function fake(mixed $orange = null, mixed $lam = null): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 'tok', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => $orange ?? Http::response([
                'outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/1'],
            ], 201),
            'lampush*' => $lam ?? Http::response(['push_id' => 'lam-1'], 200),
            'api-public-2.mtarget.fr/*' => Http::response(['results' => [['code' => 0, 'ticket' => 'mtg-1']]], 200),
        ]);
    }

    private static function timeout(): \Closure
    {
        return fn () => throw new ConnectionException('cURL error 28: Operation timed out after 10001 milliseconds with 0 bytes received');
    }

    /** @param  array<string,mixed>  $context */
    private function send(string $to, array $context = []): SmsResult
    {
        return app(SmsRouterDriver::class)->send($to, 'bonjour', $context + [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ])[$to];
    }

    private static function lamWasCalled(): bool
    {
        return Http::recorded(fn ($request) => str_contains($request->url(), 'lampush'))->isNotEmpty();
    }

    public function test_orange_timeout_does_not_roll_to_the_next_provider(): void
    {
        $this->fake(orange: self::timeout());

        $result = $this->send(self::ORANGE);

        $this->assertSame('orange', $result->provider);
        $this->assertSame(SmsResult::STATUS_FAILED, $result->status);
        $this->assertTrue($result->ambiguous);
        $this->assertFalse(self::lamWasCalled());
    }

    public function test_orange_5xx_does_not_roll_to_the_next_provider(): void
    {
        $this->fake(orange: Http::response(['error' => 'bad gateway'], 502));

        $result = $this->send(self::ORANGE);

        $this->assertSame('orange', $result->provider);
        $this->assertTrue($result->ambiguous);
        $this->assertFalse(self::lamWasCalled());
    }

    public function test_orange_refused_connection_still_rolls_to_lam(): void
    {
        $this->fake(orange: fn () => throw new ConnectionException('cURL error 7: Failed to connect to api.orange.com port 443'));

        $this->assertSame('lafricamobile', $this->send(self::ORANGE)->provider);
    }

    public function test_orange_4xx_still_rolls_to_lam(): void
    {
        $this->fake(orange: Http::response(['requestError' => ['policyException' => ['messageId' => 'POL0001']]], 400));

        $this->assertSame('lafricamobile', $this->send(self::ORANGE)->provider);
    }

    public function test_lam_timeout_does_not_roll_to_mtarget(): void
    {
        $this->fake(lam: self::timeout());

        $result = $this->send(self::FREE);

        $this->assertSame('lafricamobile', $result->provider);
        $this->assertTrue($result->ambiguous);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'mtarget'));
    }

    public function test_mtarget_5xx_is_ambiguous(): void
    {
        config()->set('sms.fallback_chains.expresso', ['mtarget', 'lafricamobile']);
        Http::preventStrayRequests();
        Http::fake([
            'api-public-2.mtarget.fr/*' => Http::response('gateway down', 503),
            'lampush*' => Http::response(['push_id' => 'lam-1'], 200),
        ]);

        $result = $this->send('+221701234567');

        $this->assertSame('mtarget', $result->provider);
        $this->assertTrue($result->ambiguous);
        $this->assertFalse(self::lamWasCalled());
    }

    public function test_a_one_time_code_keeps_the_fallback_on_an_ambiguous_failure(): void
    {
        $this->fake(orange: self::timeout());

        $result = $this->send(self::ORANGE, ['is_otp' => true]);

        $this->assertSame('lafricamobile', $result->provider);
        $this->assertSame(SmsResult::STATUS_SENT, $result->status);
    }

    public function test_the_three_one_time_code_senders_flag_is_otp(): void
    {
        $sms = FakeSmsRouter::install();
        $user = User::factory()->create([
            'email' => null,
            'email_verified_at' => null,
            'phone' => '+221770000011',
            'phone_verified_at' => now(),
        ]);

        app(PhoneVerificationService::class)->sendCodeTo('login', '+221770000012');
        app(DeletionStepUpService::class)->sendCode($user);
        app(SmsChannel::class)->send($user, new LeaseSignatureCodeNotification('123456', 'LS-1', 10, LeaseSignatureCodeNotification::CHANNEL_SMS));

        $this->assertCount(3, $sms->sent);
        foreach ($sms->sent as $envoi) {
            $this->assertTrue($envoi['context']['is_otp'] ?? false, (string) ($envoi['context']['event_type'] ?? 'lease_signature_code'));
        }
    }
}
