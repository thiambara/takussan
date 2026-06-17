<?php

namespace Tests\Feature\Services\Whatsapp;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Models\NotificationPreference;
use App\Models\NotificationTemplate;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Notifications\Channels\WhatsappChannel;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * TCK-282 — WhatsApp channel: window-aware text/template, opt-in/critical
 * gates, rate limit, and the cross-channel SMS fallback. Http::fake only —
 * zero real Meta calls.
 */
class WhatsappChannelTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $user;

    private string $phone = '+221761234567';

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->user = User::factory()->create([
            'agency_id' => $this->agency->id,
            'phone' => $this->phone,
            'phone_verified_at' => now(),
        ]);
        // WhatsApp Cloud credentials + an SMS integration for the fallback path.
        Integration::create([
            'provider' => 'whatsapp_cloud',
            'agency_id' => $this->agency->id,
            'credentials' => ['phone_number_id' => '123456', 'access_token' => 'tok'],
            'is_active' => true,
        ]);
        Integration::create([
            'provider' => 'sms_lafricamobile',
            'agency_id' => $this->agency->id,
            'credentials' => ['accountid' => 'a', 'password' => 'p', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);
        config()->set('whatsapp.default_driver', 'cloud');
        config()->set('sms.quiet_hours.enabled', false);
        config()->set('sms.webhook_url_token', 'tck-282-test');
        RateLimiter::clear("whatsapp-channel:user:{$this->user->id}");
        $this->optIn('whatsapp');
    }

    /**
     * Fake HTTP per-test: Laravel's Http::fake() keeps the first matching
     * stub, so success and error stubs cannot both live in setUp.
     */
    private function fakeHttp(int $graphStatus = 200, array $graphBody = ['messages' => [['id' => 'wamid.OK1']]]): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response($graphBody, $graphStatus),
            'lampush*' => Http::response(['push_id' => 'lam-x'], 200),
        ]);
    }

    private function optIn(string $channel): void
    {
        NotificationPreference::updateOrCreate(
            ['user_id' => $this->user->id, 'event_type' => 'booking_request', 'channel' => $channel],
            ['enabled' => true],
        );
    }

    private function contact(?\DateTimeInterface $lastInbound, string $optInStatus = WhatsappContact::OPT_IN_OPTED_IN): WhatsappContact
    {
        return WhatsappContact::create([
            'phone' => $this->phone,
            'user_id' => $this->user->id,
            'opt_in_status' => $optInStatus,
            'last_inbound_at' => $lastInbound,
        ]);
    }

    public function test_ac1_text_within_window_sent_via_cloud(): void
    {
        $this->fakeHttp();
        $this->contact(now()->subHour());
        $channel = $this->app->make(WhatsappChannel::class);

        $result = $channel->send($this->user, $this->makeNotification('hello'));

        $this->assertSame(WhatsappResult::STATUS_SENT, $result[$this->phone]->status);
        Http::assertSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com')
            && $req['type'] === 'text'
            && $req['text']['body'] === 'hello');
        Http::assertNotSent(fn ($req) => str_contains($req->url(), 'lampush'));
    }

    public function test_ac2_template_used_outside_window(): void
    {
        $this->fakeHttp();
        $this->contact(now()->subDays(2));
        $template = new WhatsappTemplateRef('booking_confirmed', 'fr', ['ABC', '2026-06-20']);
        $channel = $this->app->make(WhatsappChannel::class);

        $result = $channel->send($this->user, $this->makeNotification('hello', template: $template));

        $this->assertSame(WhatsappResult::STATUS_SENT, $result[$this->phone]->status);
        Http::assertSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com')
            && $req['type'] === 'template'
            && $req['template']['name'] === 'booking_confirmed'
            && $req['template']['language']['code'] === 'fr');
    }

    public function test_ac3_hard_failure_falls_back_to_sms_with_two_attempts(): void
    {
        $this->fakeHttp(graphStatus: 500, graphBody: ['error' => ['code' => 131026]]);
        $this->contact(now()->subHour());
        $appNotification = AppNotification::factory()->create(['user_id' => $this->user->id]);
        $channel = $this->app->make(WhatsappChannel::class);

        $result = $channel->send($this->user, $this->makeNotification('hi', appNotificationId: $appNotification->id));

        $this->assertSame(WhatsappResult::STATUS_FAILED, $result['whatsapp']->status);
        $this->assertArrayHasKey('sms', $result);
        Http::assertSent(fn ($req) => str_contains($req->url(), 'lampush'));

        $providers = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $appNotification->id)
            ->pluck('provider')->all();
        $this->assertContains('whatsapp_cloud', $providers);
        $this->assertContains('lafricamobile', $providers);
    }

    public function test_ac4_opted_out_contact_falls_back_to_sms_without_calling_meta(): void
    {
        $this->fakeHttp();
        $this->contact(now()->subHour(), WhatsappContact::OPT_IN_OPTED_OUT);
        $channel = $this->app->make(WhatsappChannel::class);

        $result = $channel->send($this->user, $this->makeNotification('hi'));

        $this->assertSame(WhatsappResult::STATUS_DEFERRED_TO_FALLBACK, $result['whatsapp']->status);
        Http::assertNotSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com'));
        Http::assertSent(fn ($req) => str_contains($req->url(), 'lampush'));
    }

    public function test_ac6_outside_window_without_template_falls_back_to_sms(): void
    {
        $this->fakeHttp();
        $this->contact(now()->subDays(3));
        $channel = $this->app->make(WhatsappChannel::class);

        $result = $channel->send($this->user, $this->makeNotification('hi'));

        $this->assertSame(WhatsappResult::STATUS_DEFERRED_TO_FALLBACK, $result['whatsapp']->status);
        Http::assertNotSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com'));
        Http::assertSent(fn ($req) => str_contains($req->url(), 'lampush'));
    }

    public function test_tck283_registry_approved_template_used_outside_window(): void
    {
        $this->fakeHttp();
        NotificationTemplate::query()->create([
            'event' => 'booking_request',
            'channel' => 'whatsapp',
            'locale' => app()->getLocale(),
            'body' => 'n/a',
            'meta_template_name' => 'booking_confirmed_v1',
            'meta_category' => 'utility',
            'meta_status' => 'approved',
            'meta_variables' => ['reference'],
        ]);
        $this->contact(now()->subDays(2));
        $channel = $this->app->make(WhatsappChannel::class);

        // Notification supplies no self-contained template — the registry does.
        $result = $channel->send($this->user, $this->makeNotification('hi'));

        $this->assertSame(WhatsappResult::STATUS_SENT, $result[$this->phone]->status);
        Http::assertSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com')
            && $req['type'] === 'template'
            && $req['template']['name'] === 'booking_confirmed_v1');
    }

    public function test_tck283_unapproved_registry_template_falls_back_to_sms(): void
    {
        $this->fakeHttp();
        NotificationTemplate::query()->create([
            'event' => 'booking_request',
            'channel' => 'whatsapp',
            'locale' => app()->getLocale(),
            'body' => 'n/a',
            'meta_template_name' => 'booking_confirmed_v1',
            'meta_category' => 'utility',
            'meta_status' => 'pending',
        ]);
        $this->contact(now()->subDays(2));
        $channel = $this->app->make(WhatsappChannel::class);

        $result = $channel->send($this->user, $this->makeNotification('hi'));

        $this->assertSame(WhatsappResult::STATUS_DEFERRED_TO_FALLBACK, $result['whatsapp']->status);
        Http::assertNotSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com'));
        Http::assertSent(fn ($req) => str_contains($req->url(), 'lampush'));
    }

    public function test_ac7_rate_limit_blocks_non_critical_but_not_critical(): void
    {
        $this->fakeHttp();
        config()->set('whatsapp.rate_limit.per_user_per_hour', 1);
        $this->contact(now()->subHour());
        $channel = $this->app->make(WhatsappChannel::class);

        $this->assertIsArray($channel->send($this->user, $this->makeNotification('1')));
        // Second non-critical send is rate-limited → null.
        $this->assertNull($channel->send($this->user, $this->makeNotification('2')));
        // Critical bypasses the limit.
        $this->assertIsArray($channel->send($this->user, $this->makeNotification('3', critical: true)));
    }

    public function test_unverified_phone_is_skipped(): void
    {
        $this->fakeHttp();
        $this->user->update(['phone_verified_at' => null]);
        $this->contact(now()->subHour());
        $channel = $this->app->make(WhatsappChannel::class);

        $this->assertNull($channel->send($this->user, $this->makeNotification('hi', critical: true)));
        Http::assertNothingSent();
    }

    public function test_non_critical_without_optin_is_skipped(): void
    {
        $this->fakeHttp();
        NotificationPreference::query()->where('user_id', $this->user->id)->delete();
        $this->contact(now()->subHour());
        $channel = $this->app->make(WhatsappChannel::class);

        $this->assertNull($channel->send($this->user, $this->makeNotification('hi')));
        Http::assertNothingSent();
    }

    private function makeNotification(
        string $body,
        bool $critical = false,
        ?WhatsappTemplateRef $template = null,
        ?int $appNotificationId = null,
    ): Notification {
        return new class($body, $critical, $template, $appNotificationId) extends Notification implements SupportsSms, SupportsWhatsapp
        {
            public function __construct(
                public string $body,
                public bool $critical,
                public ?WhatsappTemplateRef $template,
                public ?int $appNotificationId,
            ) {}

            public function via(object $notifiable): array
            {
                return ['whatsapp'];
            }

            public function whatsappEventType(): string
            {
                return 'booking_request';
            }

            public function smsEventType(): string
            {
                return 'booking_request';
            }

            public function appNotificationIdFor(object $notifiable): ?int
            {
                return $this->appNotificationId;
            }

            public function toWhatsapp(object $notifiable): string
            {
                return $this->body;
            }

            public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef
            {
                return $this->template;
            }

            public function shouldSendWhatsapp(): bool
            {
                return true;
            }

            public function isCriticalWhatsapp(): bool
            {
                return $this->critical;
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
                return $this->critical;
            }
        };
    }
}
