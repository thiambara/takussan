<?php

namespace Tests\Feature\Services\Sms;

use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Notifications\Channels\SmsChannel;
use App\Notifications\Concerns\SupportsSms;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Mockery;
use Tests\TestCase;

/**
 * TCK-799 (P11.05) — un SMS qui ne part pas laisse une trace : un `warning` quand aucun
 * fournisseur n'est disponible, une tentative écrite même sans notification, et un seau à part
 * pour les SMS critiques.
 */
class SmsFailureTraceTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221761234567';

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.quiet_hours.enabled', false);
    }

    public function test_a_chain_without_any_provider_logs_a_warning(): void
    {
        config()->set('sms.fallback_chains', ['default' => ['lafricamobile', 'mtarget']]);
        Log::spy();

        $results = app(SmsRouterDriver::class)->send(self::NUMERO, 'code 123456', ['is_critical' => true]);

        $this->assertSame('no_provider_available', $results[self::NUMERO]->failureReason);
        Log::shouldHaveReceived('warning')
            ->with('[sms.router] aucun fournisseur disponible', Mockery::on(
                fn (array $ctx) => ($ctx['phone_suffix'] ?? null) === '4567'
                    && ! in_array(self::NUMERO, $ctx, true)
                    && ($ctx['is_critical'] ?? null) === true,
            ))
            ->once();
    }

    public function test_an_attempt_without_notification_is_written(): void
    {
        config()->set('sms.fallback_chains', ['default' => ['lafricamobile']]);

        app(SmsRouterDriver::class)->send(self::NUMERO, 'code 123456', []);

        $attempt = NotificationDeliveryAttempt::query()->sole();
        $this->assertNull($attempt->app_notification_id);
        $this->assertSame(SmsResult::STATUS_FAILED, $attempt->status);
        $this->assertSame('no_provider_available', $attempt->failure_reason);
        $this->assertSame(self::NUMERO, $attempt->to);
        $this->assertSame(1, $attempt->attempt);
    }

    public function test_a_sent_attempt_without_notification_is_written(): void
    {
        config()->set('sms.fallback_chains', ['default' => ['log']]);

        app(SmsRouterDriver::class)->send(self::NUMERO, 'code 123456', []);

        $attempt = NotificationDeliveryAttempt::query()->sole();
        $this->assertNull($attempt->app_notification_id);
        $this->assertSame(SmsResult::STATUS_SENT, $attempt->status);
    }

    public function test_critical_sms_have_their_own_bucket(): void
    {
        config()->set('sms.rate_limit.per_user_per_hour', 2);
        $user = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        RateLimiter::clear("sms-channel:user:{$user->id}");
        RateLimiter::clear("sms-channel:critical:user:{$user->id}");
        $this->mock(SmsRouterDriver::class, function ($mock) {
            $mock->shouldReceive('send')->times(4)->andReturn([]);
        });
        $channel = app(SmsChannel::class);

        // Le seau ordinaire est plein : les codes critiques partent encore.
        $this->assertSame([], $channel->send($user, $this->sms(critical: false)));
        $this->assertSame([], $channel->send($user, $this->sms(critical: false)));
        $this->assertNull($channel->send($user, $this->sms(critical: false)));
        $this->assertSame([], $channel->send($user, $this->sms(critical: true)));
        $this->assertSame([], $channel->send($user, $this->sms(critical: true)));
        // Le seau critique a la même borne.
        $this->assertNull($channel->send($user, $this->sms(critical: true)));
    }

    private function sms(bool $critical): Notification
    {
        return new class($critical) extends Notification implements SupportsSms
        {
            public function __construct(private readonly bool $critical) {}

            public function via(object $notifiable): array
            {
                return [SmsChannel::class];
            }

            public function toSms(object $notifiable): string
            {
                return 'message';
            }

            public function shouldSendSms(): bool
            {
                return true;
            }

            public function isCriticalSms(): bool
            {
                return $this->critical;
            }
        };
    }
}
