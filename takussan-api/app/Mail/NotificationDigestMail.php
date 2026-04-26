<?php

namespace App\Mail;

use App\Jobs\Notifications\BuildUserDigestJob;
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
 * TCK-103 — Digest email grouping non-critical notifications by category.
 *
 * @see BuildUserDigestJob
 */
class NotificationDigestMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /**
     * @param  Collection<string, Collection<int, AppNotification>>  $grouped  Keyed by NotificationType value
     */
    public function __construct(
        public readonly User $user,
        public readonly Collection $grouped,
        public readonly string $unsubscribeUrl,
        public readonly bool $truncated = false,
    ) {
        $locale = $user->preferred_language ?: config('app.locale');
        $this->locale($locale);
    }

    public function envelope(): Envelope
    {
        $count = $this->grouped->flatten(1)->count();
        $locale = $this->user->preferred_language ?: config('app.locale');

        return new Envelope(
            subject: __('notifications.digest.subject', ['count' => $count], $locale),
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.notifications.notification-digest',
            with: [
                'user' => $this->user,
                'grouped' => $this->grouped,
                'unsubscribeUrl' => $this->unsubscribeUrl,
                'truncated' => $this->truncated,
            ],
        );
    }
}
