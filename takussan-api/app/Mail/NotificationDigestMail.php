<?php

namespace App\Mail;

use App\Http\Controllers\NotificationUnsubscribeController;
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
 * P97.06 (TCK-1183) — le désabonnement suit ADR-0050 : le lien visible ouvre la page du front à un
 * bouton, et `List-Unsubscribe` / `List-Unsubscribe-Post` annoncent le `POST` en un clic (RFC
 * 8058). Les liens se bâtissent à l'envoi, et non à la construction : un résumé mis en file avant
 * TCK-1183 part ainsi avec les liens neufs.
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

    /** @var array{page: string, one_click: string}|null */
    private ?array $unsubscribeLinks = null;

    /** @return array{page: string, one_click: string} */
    private function unsubscribeLinks(): array
    {
        return $this->unsubscribeLinks ??= NotificationUnsubscribeController::links($this->user);
    }

    public function headers(): Headers
    {
        return new Headers(text: [
            'List-Unsubscribe' => '<'.$this->unsubscribeLinks()['one_click'].'>',
            'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
        ]);
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.notifications.notification-digest',
            with: [
                'user' => $this->user,
                'grouped' => $this->grouped,
                'unsubscribeUrl' => $this->unsubscribeLinks()['page'],
                'truncated' => $this->truncated,
            ],
        );
    }
}
