<?php

namespace Tests\Feature\Notifications;

use App\Jobs\Notifications\BuildUserDigestJob;
use App\Mail\NotificationDigestMail;
use App\Models\AppNotification;
use App\Models\Enums\EmailFrequency;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Services\Notifications\DigestBuilderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class NotificationDigestMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_sends_digest_mail_for_daily_user_with_unread_notifications(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'digest_send_at' => '08:00',
            'timezone' => 'Africa/Dakar',
            'email' => 'digest@example.com',
        ]);

        $this->makeNotification($user);
        $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertQueued(NotificationDigestMail::class, fn ($m) => $m->hasTo('digest@example.com'));
    }

    public function test_does_not_send_when_no_unread_notifications(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'empty@example.com',
        ]);

        // All read — no eligible notifications
        $this->makeNotification($user, ['is_read' => true, 'read_at' => now()]);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    public function test_marks_notifications_as_digested_after_send(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'mark@example.com',
        ]);

        $n = $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        $this->assertNotNull($n->fresh()->digested_at);
    }

    public function test_does_not_resend_digested_notifications_on_retry(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'idempotent@example.com',
        ]);

        $n = $this->makeNotification($user, ['digested_at' => now()->subHour()]);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
        // digested_at should remain the original timestamp (not overwritten).
        $this->assertTrue($n->fresh()->digested_at->lt(now()->subMinute()));
    }

    public function test_does_not_include_critical_notifications(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'critical@example.com',
        ]);

        // Only a critical notification — should result in empty digest (no mail)
        $this->makeNotification($user, ['data' => ['is_critical' => true]]);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    public function test_digest_mail_contains_unsubscribe_url(): void
    {
        $user = User::factory()->create(['email' => 'unsub@example.com']);
        $grouped = collect(['system' => collect([$this->makeNotification($user)])]);
        $url = URL::signedRoute('notifications.unsubscribe', ['user' => $user->id]);

        $mail = new NotificationDigestMail($user, $grouped, $url);
        $rendered = $mail->render();

        $this->assertStringContainsString('unsubscribe', $rendered);
    }

    public function test_unsubscribe_signed_route_sets_email_frequency_off(): void
    {
        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'email' => 'unsub2@example.com',
        ]);

        $url = URL::signedRoute('notifications.unsubscribe', ['user' => $user->id]);

        $this->get($url)->assertRedirect();

        $this->assertSame(EmailFrequency::Off, $user->fresh()->email_frequency);
    }

    public function test_skips_instant_user(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Instant,
            'email' => 'instant@example.com',
        ]);

        $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    public function test_skips_off_user(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Off,
            'email' => 'off@example.com',
        ]);

        $this->makeNotification($user);

        (new BuildUserDigestJob($user))->handle(app(DigestBuilderService::class));

        Mail::assertNothingOutgoing();
    }

    private function makeNotification(User $user, array $overrides = []): AppNotification
    {
        $n = AppNotification::create(array_merge([
            'user_id' => $user->id,
            'type' => NotificationType::System->value,
            'delivery_channel' => NotificationChannel::App->value,
            'title' => 'Test notification',
            'body' => 'Content',
            'is_read' => false,
        ], array_filter($overrides, fn ($k) => ! in_array($k, ['created_at', 'updated_at']), ARRAY_FILTER_USE_KEY)));

        if (isset($overrides['created_at'])) {
            $n->forceFill(['created_at' => $overrides['created_at'], 'updated_at' => $overrides['updated_at'] ?? $overrides['created_at']])->save();
        }

        return $n;
    }
}
