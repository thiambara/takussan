<?php

namespace Tests\Feature\Services\Sms;

use App\Jobs\SendDeferredSmsJob;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Services\Notifications\Sms\IntegrationLocator;
use App\Services\Notifications\Sms\OrangeDailyCapTracker;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * TCK-102 — Routing, fallback chain, Orange cap, Integration toggle and
 * delivery_attempts tracking. Drives the AC1 → AC9, AC14, AC19, AC20
 * scenarios end-to-end (HTTP mocked at the Laravel client layer).
 */
class SmsRouterDriverTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        // Default sender_address required by Orange driver; override
        // per-test via integration metadata as needed.
        config()->set('sms.webhook_url_token', 'tck-102-test-token');
    }

    private function makeIntegration(string $provider, array $credentials = [], array $metadata = []): Integration
    {
        return Integration::create([
            'provider' => $provider,
            'agency_id' => $this->agency->id,
            'credentials' => array_merge([
                'client_id' => 'cid',
                'client_secret' => 'csec',
                'sender_address' => 'tel:+221771111111',
                'username' => 'mtg-user',
                'password' => 'mtg-pass',
                'accountid' => 'lam-acc',
                'sender_id' => 'TAKUSSAN',
            ], $credentials),
            'metadata' => $metadata,
            'is_active' => true,
        ]);
    }

    private function fakeOrangeOauth(): void
    {
        Http::fake([
            'api.orange.com/oauth/v3/token' => Http::response([
                'access_token' => 'oat-123',
                'token_type' => 'Bearer',
                'expires_in' => 3600,
            ]),
        ]);
    }

    public function test_orange_number_routes_to_orange_driver(): void
    {
        $this->makeIntegration('sms_orange');
        $this->makeIntegration('sms_lafricamobile');
        $this->makeIntegration('sms_mtarget');

        Http::preventStrayRequests();
        Http::fake([
            'api.orange.com/oauth/*' => Http::response([
                'access_token' => 'tok', 'expires_in' => 3600,
            ]),
            'api.orange.com/smsmessaging/*' => Http::response([
                'outboundSMSMessageRequest' => [
                    'resourceURL' => 'https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B221771111111/requests/abc-123',
                ],
            ], 201),
        ]);

        /** @var SmsRouterDriver $router */
        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+221771234567', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ]);

        $this->assertSame(SmsResult::STATUS_SENT, $results['+221771234567']->status);
        $this->assertSame('orange', $results['+221771234567']->provider);
        Http::assertSentCount(2); // OAuth + send
    }

    public function test_free_number_skips_orange_and_calls_lam(): void
    {
        $this->makeIntegration('sms_lafricamobile');

        Http::fake([
            'lampush*' => Http::response(['push_id' => 'lam-1'], 200),
        ]);

        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+221761234567', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ]);

        $this->assertSame('lafricamobile', $results['+221761234567']->provider);
        $this->assertSame(SmsResult::STATUS_SENT, $results['+221761234567']->status);
        // Orange must not have been hit at all.
        Http::assertNotSent(function ($request) {
            return str_contains((string) $request->url(), 'orange.com');
        });
    }

    public function test_expresso_numbers_route_to_lam(): void
    {
        $this->makeIntegration('sms_lafricamobile');

        Http::fake([
            'lampush*' => Http::response(['push_id' => 'lam-2'], 200),
        ]);

        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send(['+221701234567', '+221751234567'], 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ]);

        $this->assertSame('lafricamobile', $results['+221701234567']->provider);
        $this->assertSame('lafricamobile', $results['+221751234567']->provider);
    }

    public function test_orange_failure_falls_back_to_lam_then_mtarget(): void
    {
        $this->makeIntegration('sms_orange');
        $this->makeIntegration('sms_lafricamobile');
        $this->makeIntegration('sms_mtarget');

        Http::fake([
            'api.orange.com/oauth/*' => Http::response([
                'access_token' => 'tok', 'expires_in' => 3600,
            ]),
            'api.orange.com/smsmessaging/*' => Http::response(['error' => 'boom'], 500),
            'lampush*' => Http::response(['error' => 'lam-down'], 500),
            'api-public-2.mtarget.fr/*' => Http::response([
                'results' => [['code' => 0, 'ticket' => 'mtg-77']],
            ], 200),
        ]);

        $notification = AppNotification::factory()->create();
        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+221771234567', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
            'notification_id' => $notification->id,
        ]);

        $this->assertSame('mtarget', $results['+221771234567']->provider);
        $this->assertSame(SmsResult::STATUS_SENT, $results['+221771234567']->status);

        $attempts = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $notification->id)
            ->orderBy('attempt')
            ->get();
        $this->assertCount(3, $attempts);
        $this->assertSame('orange', $attempts[0]->provider);
        $this->assertSame('lafricamobile', $attempts[1]->provider);
        $this->assertSame('mtarget', $attempts[2]->provider);
    }

    public function test_orange_daily_cap_defers_to_lam_without_calling_orange(): void
    {
        $this->makeIntegration('sms_orange');
        $this->makeIntegration('sms_lafricamobile');

        $cap = $this->app->make(OrangeDailyCapTracker::class);
        $cap->increment('+221771234567');
        $cap->increment('+221771234567');
        $cap->increment('+221771234567');

        Http::fake([
            'lampush*' => Http::response(['push_id' => 'lam-cap'], 200),
        ]);

        $notification = AppNotification::factory()->create();
        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+221771234567', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
            'notification_id' => $notification->id,
        ]);

        $this->assertSame('lafricamobile', $results['+221771234567']->provider);
        Http::assertNotSent(fn ($request) => str_contains((string) $request->url(), 'orange.com'));

        $attempts = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $notification->id)
            ->orderBy('attempt')
            ->get();
        $this->assertSame(SmsResult::STATUS_DEFERRED_TO_FALLBACK, $attempts[0]->status);
        $this->assertSame('orange_daily_cap_reached', $attempts[0]->failure_reason);
        $this->assertSame('lafricamobile', $attempts[1]->provider);
    }

    public function test_quiet_hours_defers_non_critical_without_calling_any_driver(): void
    {
        $this->makeIntegration('sms_orange');
        $this->makeIntegration('sms_lafricamobile');

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-04-26 23:30:00', 'Africa/Dakar'));
        config()->set('sms.quiet_hours.enabled', true);

        // Queue::fake() prevents SendDeferredSmsJob from running
        // synchronously (default `sync` driver in tests) and reaching
        // the providers immediately.
        Queue::fake();
        Http::fake();

        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+221771234567', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => false,
        ]);

        $this->assertSame(SmsResult::STATUS_DEFERRED_TO_FALLBACK, $results['+221771234567']->status);
        $this->assertSame('quiet_hours', $results['+221771234567']->failureReason);
        Http::assertNothingSent();
        Queue::assertPushed(SendDeferredSmsJob::class);

        CarbonImmutable::setTestNow(); // reset
    }

    public function test_quiet_hours_does_not_defer_critical(): void
    {
        $this->makeIntegration('sms_orange');
        $this->makeIntegration('sms_lafricamobile');
        $this->makeIntegration('sms_mtarget');

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-04-26 23:30:00', 'Africa/Dakar'));
        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 't', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => Http::response([
                'outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/x/y/z/req/critical-1'],
            ], 201),
        ]);

        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+221771234567', 'OTP', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ]);

        $this->assertSame(SmsResult::STATUS_SENT, $results['+221771234567']->status);

        CarbonImmutable::setTestNow();
    }

    public function test_no_orange_integration_routes_directly_to_lam(): void
    {
        $this->makeIntegration('sms_lafricamobile');

        Http::fake([
            'lampush*' => Http::response(['push_id' => 'lam-no-orange'], 200),
        ]);

        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+221771234567', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ]);

        $this->assertSame('lafricamobile', $results['+221771234567']->provider);
        Http::assertNotSent(fn ($r) => str_contains((string) $r->url(), 'orange.com'));
    }

    public function test_no_active_integration_marks_no_provider_available(): void
    {
        // No integrations seeded.
        Http::fake();

        $notification = AppNotification::factory()->create();
        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+221771234567', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
            'notification_id' => $notification->id,
        ]);

        $this->assertSame(SmsResult::STATUS_FAILED, $results['+221771234567']->status);
        $this->assertSame('no_provider_available', $results['+221771234567']->failureReason);
        Http::assertNothingSent();
    }

    public function test_disabling_orange_integration_at_runtime_routes_to_lam(): void
    {
        $orange = $this->makeIntegration('sms_orange');
        $this->makeIntegration('sms_lafricamobile');

        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 't', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => Http::response([
                'outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/1'],
            ], 201),
            'lampush*' => Http::response(['push_id' => 'lam-rt'], 200),
        ]);

        $router = $this->app->make(SmsRouterDriver::class);
        // First send: Orange active → orange.
        $r1 = $router->send('+221771234567', 'hello', ['agency_id' => $this->agency->id, 'is_critical' => true]);
        $this->assertSame('orange', $r1['+221771234567']->provider);

        // Toggle off and reset locator cache by binding a fresh instance.
        $orange->update(['is_active' => false]);
        $this->app->forgetInstance(IntegrationLocator::class);
        $this->app->forgetInstance(SmsRouterDriver::class);

        $router = $this->app->make(SmsRouterDriver::class);
        $r2 = $router->send('+221771234567', 'hello', ['agency_id' => $this->agency->id, 'is_critical' => true]);
        $this->assertSame('lafricamobile', $r2['+221771234567']->provider);
    }

    public function test_invalid_phone_number_throws_before_routing(): void
    {
        Http::fake();

        $router = $this->app->make(SmsRouterDriver::class);
        $this->expectException(\InvalidArgumentException::class);
        $router->send('not-a-phone', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ]);
        Http::assertNothingSent();
    }

    public function test_orange_oauth_token_is_cached_across_sends(): void
    {
        $this->makeIntegration('sms_orange');

        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 'cached-tok', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => Http::response([
                'outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/x'],
            ], 201),
        ]);

        $router = $this->app->make(SmsRouterDriver::class);
        $router->send('+221771234567', 'a', ['agency_id' => $this->agency->id, 'is_critical' => true]);
        $router->send('+221781234567', 'b', ['agency_id' => $this->agency->id, 'is_critical' => true]);

        // 1 OAuth call + 2 sends = 3 HTTP calls total (token reused).
        Http::assertSentCount(3);
        Http::assertSent(fn ($r) => str_contains((string) $r->url(), 'oauth/v3/token'));
    }

    public function test_foreign_number_skips_orange_default_chain(): void
    {
        $this->makeIntegration('sms_lafricamobile');

        Http::fake([
            'lampush*' => Http::response(['push_id' => 'lam-foreign'], 200),
        ]);

        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send('+447911123456', 'hello', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ]);

        $this->assertSame('lafricamobile', $results['+447911123456']->provider);
        Http::assertNotSent(fn ($r) => str_contains((string) $r->url(), 'orange.com'));
    }

    public function test_batch_with_orange_and_free_routes_each_to_correct_driver(): void
    {
        $this->makeIntegration('sms_orange');
        $this->makeIntegration('sms_lafricamobile');

        Http::fake([
            'api.orange.com/oauth/*' => Http::response(['access_token' => 't', 'expires_in' => 3600]),
            'api.orange.com/smsmessaging/*' => Http::response([
                'outboundSMSMessageRequest' => ['resourceURL' => 'https://api.orange.com/r/y'],
            ], 201),
            'lampush*' => Http::response(['push_id' => 'lam-batch'], 200),
        ]);

        $orangeNumbers = ['+221771111111', '+221771111112', '+221771111113'];
        $freeNumbers = ['+221761111111', '+221761111112'];

        $router = $this->app->make(SmsRouterDriver::class);
        $results = $router->send([...$orangeNumbers, ...$freeNumbers], 'batch', [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ]);

        foreach ($orangeNumbers as $n) {
            $this->assertSame('orange', $results[$n]->provider);
        }
        foreach ($freeNumbers as $n) {
            $this->assertSame('lafricamobile', $results[$n]->provider);
        }
    }
}
