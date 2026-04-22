<?php

namespace App\Mail;

use App\Jobs\SendDailyNotificationDigest;
use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * Daily digest email — one per recipient, aggregates unread in-app
 * notifications from the past 24 h. Paired with {@see SendDailyNotificationDigest}.
 */
class DailyNotificationDigest extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /**
     * @param  Collection<int,AppNotification>  $notifications
     */
    public function __construct(
        public User $user,
        public Collection $notifications,
        public string $targetLocale = 'en',
    ) {
        // Ensure the whole Mailable (subject + markdown view) renders in
        // the recipient's language. Without this, the Blade template's
        // `__()` calls resolve against the worker's app locale, not the
        // recipient's `preferred_language`.
        $this->locale($this->targetLocale);
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: __('notifications.digest.subject', [
                'count' => $this->notifications->count(),
            ], $this->targetLocale),
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.notifications.digest',
            with: [
                'user' => $this->user,
                'notifications' => $this->notifications,
                'targetLocale' => $this->targetLocale,
            ],
        );
    }
}
