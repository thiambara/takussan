<?php

namespace App\Jobs\Notifications;

use App\Models\Enums\EmailFrequency;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-103 — Hourly orchestrator for notification digests.
 *
 * Runs every hour. For each user whose local time matches their
 * `digest_send_at` preference AND whose `email_frequency` is eligible
 * (daily or weekly+correct day), dispatches a per-user BuildUserDigestJob.
 *
 * Batched in chunks of 200 to avoid SMTP spikes.
 */
class SendNotificationDigestJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const DAYS_OF_WEEK = [
        'monday' => Carbon::MONDAY,
        'tuesday' => Carbon::TUESDAY,
        'wednesday' => Carbon::WEDNESDAY,
        'thursday' => Carbon::THURSDAY,
        'friday' => Carbon::FRIDAY,
        'saturday' => Carbon::SATURDAY,
        'sunday' => Carbon::SUNDAY,
    ];

    public function handle(): void
    {
        User::query()
            ->whereIn('email_frequency', [EmailFrequency::Daily->value, EmailFrequency::Weekly->value])
            ->where('notifications_email_enabled', true)
            ->whereNotNull('email')
            ->chunkById(200, function ($users) {
                foreach ($users as $user) {
                    if ($this->isEligible($user)) {
                        BuildUserDigestJob::dispatch($user);
                    }
                }
            });
    }

    private function isEligible(User $user): bool
    {
        $tz = $user->timezone ?: 'Africa/Dakar';
        $localNow = now()->setTimezone($tz);

        // Hourly precision: the orchestrator runs every hour at minute 0, so
        // we match on the hour component only. This also tolerates the
        // ":30"-style values some users may save in digest_send_at.
        $localHour = (int) $localNow->format('G');
        $sendAt = $user->digest_send_at ?? '08:00';
        $sendHour = (int) substr($sendAt, 0, 2);

        if ($localHour !== $sendHour) {
            return false;
        }

        return match ($user->email_frequency) {
            EmailFrequency::Daily => true,
            EmailFrequency::Weekly => $this->isCorrectDayOfWeek($user, $localNow),
            default => false,
        };
    }

    private function isCorrectDayOfWeek(User $user, Carbon $localNow): bool
    {
        $day = strtolower($user->digest_day_of_week ?? 'monday');
        $expectedDow = self::DAYS_OF_WEEK[$day] ?? Carbon::MONDAY;

        return $localNow->dayOfWeek === $expectedDow;
    }
}
