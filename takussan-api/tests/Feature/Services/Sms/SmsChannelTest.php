<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\Channels\SmsChannel;
use App\Notifications\Concerns\SupportsSms;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Mockery;
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

    /**
     * TCK-2464 (AC1) — le canal est FERMÉ par défaut : une notification non critique qui ne déclare
     * aucun événement de préférence n'atteint pas le fournisseur, même pour un utilisateur qui a
     * activé le SMS sur un autre événement, et le refus se journalise au lieu de se taire.
     */
    public function test_tck2464_non_critical_without_event_is_refused_and_logged(): void
    {
        NotificationPreference::updateOrCreate(
            ['user_id' => $this->user->id, 'event_type' => 'message_received', 'channel' => 'sms'],
            ['enabled' => true],
        );
        Log::spy();
        $channel = $this->app->make(SmsChannel::class);

        $this->assertNull($channel->send($this->user, $this->makeWithoutEvent(critical: false)));

        Http::assertNothingSent();
        Log::shouldHaveReceived('warning')
            ->with('[sms-channel] non-critical notification without a preference event — refused', Mockery::on(
                fn (array $ctx) => str_contains((string) ($ctx['notification'] ?? ''), '@anonymous')
                    && ($ctx['user_id'] ?? null) === $this->user->id,
            ))
            ->once();
    }

    /** TCK-2464 — le SMS critique (code de signature, avis de suppression) part toujours sans événement. */
    public function test_tck2464_critical_without_event_is_still_sent(): void
    {
        $channel = $this->app->make(SmsChannel::class);
        $result = $channel->send($this->user, $this->makeWithoutEvent(critical: true));
        $this->assertIsArray($result);
        $this->assertSame(SmsResult::STATUS_SENT, $result['+221761234567']->status);
    }

    /**
     * TCK-2464 — l'exception MOTIVÉE, option (a) : un destinataire qui n'est pas un `User` (abonné
     * d'alerte sans compte, contact routé) n'a pas de préférence ; son consentement est porté par sa
     * confirmation (ADR-0050). Le canal le laisse passer, événement déclaré ou non — c'est le
     * comportement d'avant le ticket, écrit ici pour qu'on ne le change pas sans le voir.
     */
    public function test_tck2464_non_user_recipient_is_an_explicit_exception(): void
    {
        $contact = (new AnonymousNotifiable)->route('sms', '+221761234567');
        $channel = $this->app->make(SmsChannel::class);

        $this->assertIsArray($channel->send($contact, $this->makeWithoutEvent(critical: false)));
    }

    private function makeWithoutEvent(bool $critical): Notification
    {
        return new class($critical) extends Notification implements SupportsSms
        {
            public function __construct(public bool $critical) {}

            public function via(object $notifiable): array
            {
                return ['sms'];
            }

            public function toSms(object $notifiable): string
            {
                return 'sans evenement';
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

    private function makeCritical(string $body): Notification
    {
        return new class($body) extends Notification implements SupportsSms
        {
            public function __construct(public string $body) {}

            public function shouldSendSms(): bool
            {
                return true;
            }

            public function isCriticalSms(): bool
            {
                return true;
            }

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
