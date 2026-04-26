<?php

namespace App\Jobs\Notifications;

use App\Mail\NotificationDigestMail;
use App\Models\Enums\EmailFrequency;
use App\Models\User;
use App\Services\Notifications\DigestBuilderService;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;

/**
 * TCK-103 — Per-user digest job dispatched by SendNotificationDigestJob.
 *
 * Collects eligible notifications in the appropriate window, sends the
 * digest email if non-empty, and marks each notification as digested.
 */
class BuildUserDigestJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly User $user) {}

    public function handle(DigestBuilderService $builder): void
    {
        $frequency = $this->user->email_frequency;

        // Guard: only process digest-eligible users. Re-checked here because
        // preferences may have changed between dispatch and worker execution.
        if (! in_array($frequency, [EmailFrequency::Daily, EmailFrequency::Weekly], true)) {
            return;
        }

        if (! $this->user->notifications_email_enabled || ! $this->user->email) {
            return;
        }

        $windowStart = $this->windowStart($frequency);
        $grouped = $builder->buildForUser($this->user, $windowStart);
        $all = $builder->flatten($grouped);

        if ($all->isEmpty()) {
            return;
        }

        $truncated = $all->count() >= DigestBuilderService::MAX_NOTIFICATIONS;
        $unsubscribeUrl = URL::signedRoute('notifications.unsubscribe', ['user' => $this->user->id]);

        try {
            Mail::to($this->user->email)->send(new NotificationDigestMail(
                user: $this->user,
                grouped: $grouped,
                unsubscribeUrl: $unsubscribeUrl,
                truncated: $truncated,
            ));
        } finally {
            // Always mark as digested even on partial failures to prevent
            // re-sending the same batch on the next run.
            $builder->markDigested($all);
        }
    }

    private function windowStart(EmailFrequency $frequency): Carbon
    {
        return match ($frequency) {
            EmailFrequency::Daily => now()->subDay(),
            EmailFrequency::Weekly => now()->subWeek(),
            default => now()->subDay(),
        };
    }
}
