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
use Illuminate\Mail\Mailables\Headers;
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
     * @param  string  $unsubscribeUrl  la page du front qui confirme (lien visible)
     * @param  string  $oneClickUrl  le `POST` signé de l'API (`List-Unsubscribe`, RFC 8058)
     */
    public function __construct(
        public readonly User $user,
        public readonly Collection $grouped,
        public readonly string $unsubscribeUrl,
        public readonly string $oneClickUrl,
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

    /**
     * P97.06 (TCK-1243) — RFC 8058, comme les alertes de recherche (ADR-0050) : le client de
     * messagerie désabonne en un clic par un `POST` sur l'API ; le lien visible ouvre une page à
     * un bouton. Un `GET` ne désabonne jamais.
     */
    public function headers(): Headers
    {
        return new Headers(text: [
            'List-Unsubscribe' => '<'.$this->oneClickUrl.'>',
            'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
        ]);
    }
}
