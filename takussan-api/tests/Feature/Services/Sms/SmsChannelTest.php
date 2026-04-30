<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\Channels\SmsChannel;
use App\Notifications\Concerns\Critical;
use App\Notifications\Concerns\SupportsSms;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * TCK-102 — Channel-level gates: opt-in/opt-out, criticality bypass,
 * rate limit, missing phone. Each test exercises a single AC path.
 */
class SmsChannelTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->user = User::factory()->create([
            'agency_id' => $this->agency->id,
            'phone' => '+221761234567',
            'phone_verified_at' => now(),
        ]);
        Integration::create([
            'provider' => 'sms_lafricamobile',
            'agency_id' => $this->agency->id,
            'credentials' => ['accountid' => 'a', 'password' => 'p', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);
        config()->set('sms.webhook_url_token', 'tck-102-test-token');
        config()->set('sms.quiet_hours.enabled', false);
        Http::fake([
            'lampush*' => Http::response(['push_id' => 'lam-x'], 200),
        ]);
        RateLimiter::clear("sms-channel:user:{$this->user->id}");
    }

    public function test_critical_notification_is_sent(): void
    {
        $channel = $this->app->make(SmsChannel::class);
        $result = $channel->send($this->user, $this->makeCritical('hi'));
        $this->assertIsArray($result);
        $this->assertSame(SmsResult::STATUS_SENT, $result['+221761234567']->status);
    }

    public function test_non_critical_notification_without_optin_is_skipped(): void
    {
        $channel = $this->app->make(SmsChannel::class);
        $result = $channel->send($this->user, $this->makeNonCritical('hi', 'message_received'));
        $this->assertNull($result);
        Http::assertNothingSent();
    }

    public function test_non_critical_notification_with_optin_is_sent(): void
    {
        NotificationPreference::updateOrCreate(
            [
                'user_id' => $this->user->id,
                'event_type' => 'message_received',
                'channel' => 'sms',
            ],
            ['enabled' => true],
        );
        $channel = $this->app->make(SmsChannel::class);
        $result = $channel->send($this->user, $this->makeNonCritical('hi', 'message_received'));
        $this->assertIsArray($result);
        $this->assertSame(SmsResult::STATUS_SENT, $result['+221761234567']->status);
    }

    public function test_should_not_send_sms_returning_false_is_skipped(): void
    {
        $channel = $this->app->make(SmsChannel::class);
        $notification = new class extends Notification implements SupportsSms
        {
            public function via(object $notifiable): array
            {
                return ['sms'];
            }

            public function toSms(object $notifiable): string
            {
                return 'never';
            }

            public function shouldSendSms(): bool
            {
                return false;
            }

            public function isCriticalSms(): bool
            {
                return false;
            }
        };
        $this->assertNull($channel->send($this->user, $notification));
    }

    public function test_user_without_phone_is_skipped(): void
    {
        $this->user->update(['phone' => null]);
        $channel = $this->app->make(SmsChannel::class);
        $this->assertNull($channel->send($this->user, $this->makeCritical('hi')));
        Http::assertNothingSent();
    }

    public function test_user_without_verified_phone_is_skipped_even_for_critical(): void
    {
        // AC11 — opt-out (proxied via phone verification) wins over the
        // criticality bypass.
        $this->user->update(['phone_verified_at' => null]);
        $channel = $this->app->make(SmsChannel::class);
        $this->assertNull($channel->send($this->user, $this->makeCritical('hi')));
        Http::assertNothingSent();
    }

    public function test_rate_limit_blocks_after_threshold(): void
    {
        config()->set('sms.rate_limit.per_user_per_hour', 2);
        $channel = $this->app->make(SmsChannel::class);
        // First 2 hits should pass.
        $this->assertIsArray($channel->send($this->user, $this->makeCritical('1')));
        $this->assertIsArray($channel->send($this->user, $this->makeCritical('2')));
        // 3rd hit blocked by rate limiter.
        $this->assertNull($channel->send($this->user, $this->makeCritical('3')));
    }

    private function makeCritical(string $body): Notification
    {
        return new class($body) extends Notification implements SupportsSms
        {
            use Critical;

            public function __construct(public string $body) {}

            public function via(object $notifiable): array
            {
                return ['sms'];
            }

            public function toSms(object $notifiable): string
            {
                return $this->body;
            }

            public function smsEventType(): string
            {
                return 'security_alert';
            }
        };
    }

    private function makeNonCritical(string $body, string $eventType): Notification
    {
        return new class($body, $eventType) extends Notification implements SupportsSms
        {
            public function __construct(public string $body, public string $eventType) {}

            public function via(object $notifiable): array
            {
                return ['sms'];
            }

            public function toSms(object $notifiable): string
            {
                return $this->body;
            }

            public function shouldSendSms(): bool
            {
                return true;
            }

            public function isCriticalSms(): bool
            {
                return false;
            }

            public function smsEventType(): string
            {
                return $this->eventType;
            }
        };
    }
}
