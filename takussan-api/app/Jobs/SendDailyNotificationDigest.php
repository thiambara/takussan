<?php

namespace App\Jobs;

use App\Mail\DailyNotificationDigest;
use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;

/**
 * Daily digest email (TCK-022 P2) — aggregates unread in-app notifications
 * from the past 24 h into a single email per user who opted in to digest.
 *
 * Scheduled via `routes/console.php` / `Schedule::daily()`.
 */
class SendDailyNotificationDigest implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): int
    {
        $since = now()->subDay();
        $sent = 0;

        User::query()
            ->where('notifications_email_enabled', true)
            ->whereNotNull('email')
            ->chunkById(200, function ($users) use ($since, &$sent) {
                foreach ($users as $user) {
                    $notifications = AppNotification::query()
                        ->where('user_id', $user->id)
                        ->where('is_read', false)
                        ->where('created_at', '>=', $since)
                        ->orderByDesc('created_at')
                        ->get();

                    if ($notifications->isEmpty()) {
                        continue;
                    }

                    $this->sendDigest($user, $notifications);
                    $sent++;
                }
            });

        return $sent;
    }

    /**
     * @param  Collection<int,AppNotification>  $notifications
     */
    protected function sendDigest(User $user, Collection $notifications): void
    {
        // Localize against the recipient's preferred language.
        $locale = $user->preferred_language ?: config('app.locale');

        try {
            Mail::to($user->email)->send(new DailyNotificationDigest(
                user: $user,
                notifications: $notifications,
                targetLocale: $locale,
            ));
        } catch (\Throwable) {
            // Mail not configured — skip silently, same pattern as NotificationService.
        }
    }
}
