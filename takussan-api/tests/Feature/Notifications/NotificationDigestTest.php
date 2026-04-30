<?php

namespace Tests\Feature\Notifications;

use App\Jobs\SendDailyNotificationDigest;
use App\Mail\DailyNotificationDigest;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class NotificationDigestTest extends TestCase
{
    use RefreshDatabase;

    public function test_digest_sends_email_to_user_with_unread_notifications_in_last_day(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email' => 'user@example.com',
            'notifications_email_enabled' => true,
        ]);

        $this->makeNotification($user, ['is_read' => false]);
        $this->makeNotification($user, ['is_read' => false]);

        $job = new SendDailyNotificationDigest;
        $sent = $job->handle();

        $this->assertSame(1, $sent);
        Mail::assertQueued(DailyNotificationDigest::class, function (DailyNotificationDigest $mail) {
            return $mail->hasTo('user@example.com')
                && $mail->notifications->count() === 2;
        });
    }

    public function test_digest_skips_users_with_no_unread_notifications(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email' => 'noop@example.com',
            'notifications_email_enabled' => true,
        ]);

        // Already read — excluded from digest.
        $this->makeNotification($user, ['is_read' => true, 'read_at' => now()]);

        $job = new SendDailyNotificationDigest;
        $sent = $job->handle();

        $this->assertSame(0, $sent);
        Mail::assertNothingOutgoing();
    }

    public function test_digest_skips_users_with_email_disabled(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email' => 'optout@example.com',
            'notifications_email_enabled' => false,
        ]);

        $this->makeNotification($user, ['is_read' => false]);

        $job = new SendDailyNotificationDigest;
        $sent = $job->handle();

        $this->assertSame(0, $sent);
        Mail::assertNothingOutgoing();
    }

    public function test_digest_ignores_notifications_older_than_24h(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email' => 'stale@example.com',
            'notifications_email_enabled' => true,
        ]);

        $this->makeNotification($user, [
            'is_read' => false,
            'created_at' => now()->subDays(3),
            'updated_at' => now()->subDays(3),
        ]);

        $job = new SendDailyNotificationDigest;
        $sent = $job->handle();

        $this->assertSame(0, $sent);
        Mail::assertNothingOutgoing();
    }

    public function test_digest_renders_subject_in_recipient_target_locale(): void
    {
        $user = User::factory()->create([
            'email' => 'fr@example.com',
            'notifications_email_enabled' => true,
            'preferred_language' => 'fr',
        ]);

        $notifications = collect([$this->makeNotification($user, ['is_read' => false])]);

        // App locale stays EN; mailable must still render in FR via targetLocale.
        app()->setLocale('en');
        $mail = new DailyNotificationDigest(user: $user, notifications: $notifications, targetLocale: 'fr');

        $envelope = $mail->envelope();
        $this->assertSame(
            __('notifications.digest.subject', ['count' => 1], 'fr'),
            $envelope->subject,
            'digest subject should render in target locale, not app locale.',
        );
    }

    public function test_digest_body_renders_in_recipient_target_locale(): void
    {
        $user = User::factory()->create([
            'email' => 'fr@example.com',
            'notifications_email_enabled' => true,
            'preferred_language' => 'fr',
        ]);

        $notifications = collect([$this->makeNotification($user, ['is_read' => false, 'title' => 'Salam', 'body' => 'hello'])]);

        app()->setLocale('en');
        $mail = new DailyNotificationDigest(user: $user, notifications: $notifications, targetLocale: 'fr');

        // Render the mailable through the Mail facade — Laravel swaps the
        // locale via `$this->locale()` before rendering the view.
        $rendered = $mail->render();

        // The FR intro string must appear in the rendered body.
        $this->assertStringContainsString(
            __('notifications.digest.intro', [], 'fr'),
            $rendered,
            'digest view should render translations in the target locale.',
        );
    }

    protected function makeNotification(User $user, array $overrides = []): AppNotification
    {
        $notification = AppNotification::create(array_merge([
            'user_id' => $user->id,
            'type' => NotificationType::System,
            'delivery_channel' => NotificationChannel::App,
            'title' => 'Digest test',
            'body' => 'Body',
            'is_read' => false,
        ], array_diff_key($overrides, array_flip(['created_at', 'updated_at']))));

        if (isset($overrides['created_at'])) {
            $notification->forceFill([
                'created_at' => $overrides['created_at'],
                'updated_at' => $overrides['updated_at'] ?? $overrides['created_at'],
            ])->save();
        }

        return $notification;
    }
}
