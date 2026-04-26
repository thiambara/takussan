<?php

namespace Tests\Feature\Jobs;

use App\Jobs\Notifications\BuildUserDigestJob;
use App\Jobs\Notifications\SendNotificationDigestJob;
use App\Models\Enums\EmailFrequency;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SendNotificationDigestJobTest extends TestCase
{
    use RefreshDatabase;

    public function test_dispatches_build_job_for_daily_user_at_correct_hour(): void
    {
        Queue::fake();

        // User in UTC+0 (Africa/Dakar) with digest at 08:00
        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'digest_send_at' => '08:00',
            'timezone' => 'Africa/Dakar',
            'email' => 'daily@example.com',
        ]);

        // Travel to 08:00 Dakar time
        Carbon::setTestNow(Carbon::parse('2026-04-27 08:00:00', 'Africa/Dakar')->utc());

        (new SendNotificationDigestJob)->handle();

        Queue::assertPushed(BuildUserDigestJob::class, fn ($job) => $job->user->id === $user->id);

        Carbon::setTestNow();
    }

    public function test_does_not_dispatch_for_daily_user_at_wrong_hour(): void
    {
        Queue::fake();

        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'digest_send_at' => '08:00',
            'timezone' => 'Africa/Dakar',
            'email' => 'daily2@example.com',
        ]);

        // 09:00 Dakar — not the send hour
        Carbon::setTestNow(Carbon::parse('2026-04-27 09:00:00', 'Africa/Dakar')->utc());

        (new SendNotificationDigestJob)->handle();

        Queue::assertNotPushed(BuildUserDigestJob::class);

        Carbon::setTestNow();
    }

    public function test_dispatches_build_job_for_weekly_user_on_correct_day(): void
    {
        Queue::fake();

        // 2026-04-27 is a Monday
        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Weekly,
            'digest_send_at' => '08:00',
            'digest_day_of_week' => 'monday',
            'timezone' => 'Africa/Dakar',
            'email' => 'weekly@example.com',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-04-27 08:00:00', 'Africa/Dakar')->utc());

        (new SendNotificationDigestJob)->handle();

        Queue::assertPushed(BuildUserDigestJob::class, fn ($job) => $job->user->id === $user->id);

        Carbon::setTestNow();
    }

    public function test_does_not_dispatch_for_weekly_user_on_wrong_day(): void
    {
        Queue::fake();

        // 2026-04-27 is a Monday → weekly user expecting Tuesday should not fire
        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Weekly,
            'digest_send_at' => '08:00',
            'digest_day_of_week' => 'tuesday',
            'timezone' => 'Africa/Dakar',
            'email' => 'weekly2@example.com',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-04-27 08:00:00', 'Africa/Dakar')->utc());

        (new SendNotificationDigestJob)->handle();

        Queue::assertNotPushed(BuildUserDigestJob::class);

        Carbon::setTestNow();
    }

    public function test_skips_instant_users(): void
    {
        Queue::fake();

        User::factory()->create([
            'email_frequency' => EmailFrequency::Instant,
            'email' => 'instant@example.com',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-04-27 08:00:00', 'Africa/Dakar')->utc());

        (new SendNotificationDigestJob)->handle();

        Queue::assertNotPushed(BuildUserDigestJob::class);

        Carbon::setTestNow();
    }

    public function test_skips_off_users(): void
    {
        Queue::fake();

        User::factory()->create([
            'email_frequency' => EmailFrequency::Off,
            'email' => 'off@example.com',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-04-27 08:00:00', 'Africa/Dakar')->utc());

        (new SendNotificationDigestJob)->handle();

        Queue::assertNotPushed(BuildUserDigestJob::class);

        Carbon::setTestNow();
    }

    public function test_respects_user_timezone_for_send_time(): void
    {
        Queue::fake();

        // User in Europe/Paris (UTC+2 in summer). digest_send_at=08:00 local.
        // At UTC 06:00 it's 08:00 Paris time → should fire.
        $user = User::factory()->create([
            'email_frequency' => EmailFrequency::Daily,
            'digest_send_at' => '08:00',
            'timezone' => 'Europe/Paris',
            'email' => 'paris@example.com',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-04-27 06:00:00', 'UTC'));

        (new SendNotificationDigestJob)->handle();

        Queue::assertPushed(BuildUserDigestJob::class, fn ($job) => $job->user->id === $user->id);

        Carbon::setTestNow();
    }
}
